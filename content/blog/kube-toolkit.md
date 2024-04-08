+++
author = "Radu Matei"
tags = ["kubernetes", "golang", "grpc"]
date = "2017-12-18"
description = "Building tools like Helm and Draft for Kubernetes using gRPC and Go"
linktitle = ""
title = "kube-toolkit: Toolkit for creating gRPC-based CLI tools for Kubernetes, written in Go"
# type = "post"
summary = "Building tools like Helm and Draft for Kubernetes using gRPC and Go"

+++

<!-- Table of Contents
=================

- [Introduction](#introduction)
- [Architecture](#architecture)
- [Vendoring `kube-toolkit`](#vendoring-kube-toolkit)
- [Defining and using gRPC services](#defining-and-using-grpc-services)
- [Connecting to the Kubernetes cluster](#connecting-to-the-kubernetes-cluster)
- [Using cobra, folder structure and adding your own commands](#using-cobra-folder-structure-and-adding-your-own-commands)
- [See in in action](#see-in-in-action)
- [Conclusion](#conclusion)


Introduction
------------ -->

If you ever used [Helm](https://github.com/kubernetes/helm) or [Draft](https://github.com/azure/draft), you know they are very cool command-line tools that connect to a Kubernetes cluster, more specifically to a server-side component (Tiller in the case of Helm, Draftd for Draft) without exposing ports on the Internet, and allow you to interact with your cluster through gRPC-based services.

[`kube-toolkit`](https://github.com/radu-matei/kube-toolkit) aims to help you build similar tools, acting as a starting point in the journey to building new experiences and tools for Kubernetes.

> This project started as a learning experience / small experiment of mine in building a tool for Kubernetes that allowed you to connect to all major cloud providers - then the Open Broker API became mainstream, and I realized I was reinventing the Service Broker wheel - so decided to take the good parts and make them available to anyone starting to build a Kubernetes tool.

### Architecture

[`kube-toolkit`](https://github.com/radu-matei/kube-toolkit) has two major components:

- `ktk` (short for Kubernetes ToolKit) - client that you install locally
- `ktkd` (short for Kuberentes ToolKit Daemon) - server-side component that is deployed on your Kubernetes cluster


The `kube-toolkit` client (`ktk`) interacts with the server-side component (`ktkd`) using the Kubernetes API to create authenticated tunnels back to the cluster, using gRPC as the underlying communication protocol. The server runs as a pod in Kubernetes, and since it is only a starting point for future tools, it only knows how to return its version, and showcases how to stream data back to the client.

In order to communicate with the cluster you need to pass the `kubeconfig` file, and the tool will start a tunnel to the cluster for each command you execute, then will tear it down so there are no open connections to the cluster when no command is executed.


> Please note that there are still lots of things left to add, such as SSL, RBAC support or state management - you are more than welcome to contribute in any way to the project!


As stated earlier, this tool is based on the great work done by the awesome Helm and Draft teams, and is essentially a stripped down version, written from the ground-up.

Now for the actual implementation and how you can get started, and the first issue I bumped in was gathering the correct dependencies for Kubernetes 1.8:

### Vendoring `kube-toolkit`

Since this tool was built from the ground-up, the first step was to put together the correct versions of the dependencies to `k8s.io/client-go`, `github.com/kubernetes/helm`, `k8s.io/api`, `k8s.io/apimachinery` and a bunch more. A trivial step you might say, but in the times of Kubernetes 1.8, this was incredibly frustrating...

{{< tweet user="matei_radu" id="924321387128508419" >}}

Essentially, during a 4 hour period (is was probably much more than that...), I was in the process of swapping git commit hashes and plugging them into `dep`, then trying to compile the project... Word of advice - check various release branches when working with vendored dependencies of Kubernetes!

After finally getting it to work, [I ended up with a  Gopkg.toml you can find here](https://github.com/radu-matei/kube-toolkit/blob/master/Gopkg.toml) and I simply included the `vendor` folder in the repo to ensure reproducible builds.

> Please note that this setup is for Kubernetes release 1.8 - you are more than welcome to port the dependencies to release 1.9!

> Having the `vendor` folder in the repo significantly increases the size of the repo, but if you ask me, this is a small price to pay for having really reproducible builds - you can put it in `.gitignore` if you want to.

Defining and using gRPC services
--------------------------------

> If you're not familiar with gRPC for Go, there is a [great basics tutorial you can get started with](https://grpc.io/docs/tutorials/basic/go.html) and understand how to use the client and server.

In its current form, [`v0.1`](https://github.com/radu-matei/kube-toolkit/releases/tag/v0.1), the service is able to return the server and client version and showcase how to stream some data - [essentially, the `.proto` looks like this](https://github.com/radu-matei/kube-toolkit/blob/master/pkg/rpc/rpc.proto):

```
syntax = "proto3";

package rpc;

service KTK {
	rpc GetVersion(Empty) returns (Version){}
	rpc ServerStream(Empty) returns(stream StreamingMessage){}
}

message Version {
	string sem_ver = 1;
	string git_commit = 2;
}

message StreamingMessage {
	string message = 1;
}
```

This defines a service with two methods, `GetVersion` and `ServerStream` (which returns a stream of `StreamingMessage` back to the client), and **this is the place where you will first define your service methods!**

Now if we take a look at the [`Makefile`](https://github.com/radu-matei/kube-toolkit/blob/master/Makefile), there is an `rpc` target that will use the `protoc` compiler and build the client and server in Golang for our service in `pkg/rpc` (as defined in the `Makefile`).

Now it's about creating actual implementations for the client and server. [For example, the client implementation for `GetVersion` is as straightforward as simply as calling the `GetVersion` on the generated client](https://github.com/radu-matei/kube-toolkit/blob/master/pkg/ktk/client.go#L40):

```
// GetVersion returns the ktk version
func (client *Client) GetVersion(ctx context.Context) (*rpc.Version, error) {
	return client.RPC.GetVersion(ctx, &rpc.Empty{})
}
```

This function call will simply return the version from the server - note that we have to [implement the server method as below](https://github.com/radu-matei/kube-toolkit/blob/master/pkg/ktkd/server.go#L74):

```
// GetVersion returns the current version of the server.
func (server *Server) GetVersion(ctx context.Context, _ *rpc.Empty) (*rpc.Version, error) {
	log.Debugf("executing ktkd version")
	return &rpc.Version{
		SemVer:    version.SemVer,
		GitCommit: version.GitCommit}, nil
}
```

> The version and commit hash are injected at build time through compile flags. See Makefile.

Now let's take a look at some streaming messages - [first the server](https://github.com/radu-matei/kube-toolkit/blob/master/pkg/ktkd/server.go#L82):

```
// ServerStream starts a new stream from the server
func (server *Server) ServerStream(_ *rpc.Empty, stream rpc.KTK_ServerStreamServer) error {
	log.Debugf("received server stream command")
	for i := 0; i < 5; i++ {
		err := stream.Send(&rpc.StreamingMessage{
			Message: fmt.Sprintf("Sending stream back to client, iteration: %d", i),
		})
		if err != nil {
			return err
		}

		time.Sleep(2 * time.Second)
	}

	return nil
}
```

This will send 5 messages back to the client, 2 seconds apart.

[Receiving the stream is done like this](https://github.com/radu-matei/kube-toolkit/blob/master/pkg/ktk/client.go#L49):

```
// ServerStream starts a stream from the server
func (client *Client) ServerStream(ctx context.Context, opts ...grpc.CallOption) error {
	log.Debugf("called InitializeCloud client method...")

	stream, err := client.RPC.ServerStream(ctx, &rpc.Empty{})
	if err != nil {
		log.Fatalf("cannot start server stream: %v", err)
		return err
	}

	for {
		message, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Fatalf("error receiving stream: %v", err)
		}

		fmt.Println(message.Message)
	}

	return nil
}
```

With this proto service, you should have a clear understanding on how to write additional methods for the gRPC service and implement the client and the server.

Now that you have a pretty good understanding on how to write gRPC client and server methods, let's explore how to connect to the Kubernetes cluster.

### Connecting to the Kubernetes cluster

For this part, I will [give 100% credits to the Draft team](https://github.com/Azure/draft/blob/master/pkg/draftd/portforwarder/portforwarder.go) as I merely copied their implementation of a port forwarder that uses the Helm packages.

Essentially, this creates a new "SSH-like tunnel" back to a pod in the Kubernetes cluster - normally, the pod is the one running our server-side component, `ktkd` (you have to specify the name and labels for it):

```
//New returns a tunnel to the ktkd pod.
func New(clientset *kubernetes.Clientset, config *restclient.Config, namespace string) (*kube.Tunnel, error) {
	podName, err := getKTKDPodName(clientset, namespace)
	if err != nil {
		return nil, err
	}
	log.Debugf("found pod: %s", podName)

    // the default port for ktkd is 10000
    const ktkdPort = 10000

    // this gets a tunnel to the ktkd pod, port 10000
	t := kube.NewTunnel(clientset.CoreV1().RESTClient(), config, namespace, podName, ktkdPort)
	return t, t.ForwardPort()
}
```

This tunnel is created for every executed command, and allows us to execute commands against `localhost:some-random-port` and then it forwards the request to `ktkdpod-internal-ip:10000`. As stated earlier, behind the scenes it uses the Go client for Kubernetes and packages from Helm.

> Please note that there is no need to publicly expose any port on the pod.

### Using cobra, folder structure and adding your own commands

Both the client and the server are essentially [`cobra`](https://github.com/spf13/cobra) CLI apps.


> If you are not familiar with cobra, it is a library created by [Steve Francia, or @spf13](https://github.com/spf13) for creating CLI apps, and tools like Kubernetes, Docker, rkt, etcd or Hugo are built upon cobra.

Let's have a look at the folder structure:

```
kube-toolkit
└───cmd
│   └───ktk
│   |    │--- ktk.go
│   |    │--- serverStream.go
│   |    │--- version.go
│   └───ktkd
│        │--- ktkd.go
│        │--- start.go
└───pkg
│   └───ktk
│   |    │--- client.go
│   └───ktkd
│   |    │--- server.go
│   └───portforwarder
│   |    │--- portforwarder.go
│   └───rpc
│   |    │--- rpc.proto
|   |    |--- rpc.pb.go
│   └───version
│   |    │--- version.go
```

In the `cmd` directory we have the CLIs for `ktk` and `ktkd`, and in `pkg` we have all packages that we use throughout the tool - the implementations for the gRPC client and server, the port forwarder, the generated Go service and proto.

Let's take a look at how everything works together for the version command:

- first of all, I briefly mentioned that the version and git commit are injected at build time using compilation flags - the `LFFLAGS` inject into `GitCommit`and `SemVer` the respective values from the `version` package from `pkg` into both the client and the server (which can have different versions!):

```
VERSION_PACKAGE = github.com/radu-matei/kube-toolkit/pkg/version
LDFLAGS += -X $(VERSION_PACKAGE).GitCommit=${GIT_COMMIT}
LDFLAGS += -X $(VERSION_PACKAGE).SemVer=${SEMVER}
```

> There is a [great article by Alex Ellis explaining everything about injecting build-time variables](https://blog.alexellis.io/inject-build-time-vars-golang/)

- earlier we saw the client and the server implementation of `GetVersion`

Now let's see how to put together the server app:

```
func newStartCmd(out io.Writer) *cobra.Command {
	startCmd := &startCmd{}

	cmd := &cobra.Command{
		Use:   "start",
		Short: startUsage,
		Long:  startUsage,
		RunE: func(cmd *cobra.Command, args []string) error {
			return startCmd.run()
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&listenAddress, "listen-addr", "0.0.0.0:10000", "the ktkd server listen address")

	return cmd
}

func (cmd *startCmd) run() error {

	cfg := &ktkd.ServerConfig{
		ListenAddress: listenAddress,
	}

	return ktkd.NewServer(cfg).Serve(context.Background())
}
```

We will simply call `ktkd start`, which will start the gRPC server and we will be ready to accept incoming requests from clients.

- now the cobra `run` method for `ktk version`:

```
func (cmd *versionCmd) run() error {

	log.Debugf("making request to: %s", ktkdHost)

	conn, err := ktk.GetGRPCConnection(ktkdHost)
	if err != nil {
		log.Fatalf("cannot create grpc connection: %v", err)
	}
	defer conn.Close()

	cmd.client = ensureKTKClient(cmd.client, conn)

	ktkdVersion, err := cmd.client.GetVersion(context.Background())
	if err != nil {
		return fmt.Errorf("cannot get ktkd version: %v", err)
        }

    fmt.Printf("ktk Semver: %s GitCommit: %s\n", version.SemVer, version.GitCommit)
    fmt.Printf("ktkd SemVer:  %s Git Commit: %s\n", ktkdVersion.SemVer, ktkdVersion.GitCommit)

	return nil
}
```

- here, we get an instance of the gRPC client, then call the server for its version. Then we simply print the version.

For every new functionality, we need to add a new cobra command (and remember to add it to the root command) and implement it accordingly.


### See in in action

First of all, you need to deploy the `ktkd` pod to a Kubernetes cluster.


> As of right now, there isn't an automated way to deploy this to Kubernetes, [but there is an open issue for anyone that wants to contribute!](https://github.com/radu-matei/kube-toolkit/issues/9)

First, you need to `make ktkd-linux` - this will create the linux binary that we will then package into a Docker container and deploy to the cluster - `docker build -t your-username/ktkd`. Then, deploy this to Kubernetes:


![](/img/article-photos/kube-toolkit/pod.jpg)

> Notice there is not port exposed!

> You can easily do this using `kubectl`

Then, we need to build our client: `make ktk`, then, passing the `kubeconfig` file, attempt to get the version:

![](/img/article-photos/kube-toolkit/ktk.jpg)

> Remember to pass the path to your `kubeconfig` file!


Conclusion
----------

And just like this, we managed to get a tool that connects to a Kubernetes cluster from a CLI application through tunnels and gRPC! You can now build your own functionality on top of this, extend the proto service and implement the client and server!

This started with me looking at Helm and Draft and trying to understand how to build a similar tool and trying to understand all concepts involved. It is by no means as complex as Helm and Draft (it actually removes some abstraction compared to Draft, in that this tool uses directly the generated gRPC client) and it should serve as a starting point building the next awesome tool for Kubernetes!

You are invited to [contribute on the GitHub repo, tackle some of the issues there and provide your feedback!](https://github.com/radu-matei/kube-toolkit)

I would love to hear your thoughts - feel free to comment below, [or send me an email](/contact)
