+++
author = "Radu Matei"
tags = ["kubernetes", "draft", "helm", "vscode"]
date = "2018-04-29"
description = ""
linktitle = ""
featured = "helm_logo_transparent.png"
featuredpath = "/img/article-photos/debug-helm-tiller/"
title = "Debug Helm and Tiller using VS Code and Draft"
# type = "post"

+++

<!-- - [Introduction](#introduction)
- [Debugging the Helm CLI](#debugging-the-helm-cli)
- [Debugging Tiller](#debugging-tiller)
    + [Building the Tiller binary for debugging](#building-the-tiller-binary-for-debugging)
    + [Creating the Docker image, pushing it to a registry](#creating-the-docker-image-pushing-it-to-a-registry)
    + [The Helm template for our deployment](#the-helm-template-for-our-deployment)
    + [Putting it all together. Start debugging with VS Code](#putting-it-all-together-start-debugging-with-vs-code)
- [Conclusion](#conclusion)

# Introduction -->

In today's article we will explore how to take a real-world application and start developing, debugging and deploying it to a Kubernetes cluster and how to use a couple of open-source tools to make our lives easier in the process. Specifically, we will use [Helm, the package manager for Kubernetes][helm], the newly released [Kubernetes extension for VS Code][kubernetes-extension] and [Draft][draft] to develop, debug and deploy is Helm itself.

> [Helm][helm] helps you manage Kubernetes applications — Helm Charts help you define, install, and upgrade even the most complex Kubernetes application.
> Charts are easy to create, version, share, and publish — so start using Helm and stop the copy-and-paste madness.
> The latest version of Helm is maintained by the CNCF - in collaboration with Microsoft, Google, Bitnami and the Helm contributor community.
> More about Helm in [the official documentation][helm-docs].

> [Draft](https://github.com/azure/draft) is an open-source tool that makes it easy to develop container-based applications and deploy them to Kubernetes clusters without knowing much about Docker and Kubernetes -- Using tools like Draft lets you and your teams focus on building the application rather than on configuring clusters and writing deployment manifests.
>  To get started with Draft you can [follow the official Draft documentation](https://github.com/Azure/draft/blob/master/docs/getting-started.md) or watch an [introduction to Draft from Azure Friday](https://www.youtube.com/watch?v=DvaT3H8Wyf8).


In a nutshell, Draft performs the following steps automatically for each iteration of your application:

- builds a container image for your app
- pushes the container image to a registry
- pushes the application to any Kubernetes cluster using a Helm chart

We will use Draft (which uses Helm, but more on that later!) to develop, debug and deploy Helm itself. Here's what we're going to achieve:

- build and debug the Helm CLI using VS Code, the [Golang extension for VS Code][golang-extension] and [Delve, the Golang debugger][delve]
- build, deploy and debug Helm's server-side component, Tiller, using the [VS Code Kubernetes extension][kubernetes-extension] and [Draft][draft]

To follow along this article, you can use [my branch of Helm][helm-branch] which contains all the assets necessary assets for debugging:

```shell
$ git clone -b debugging-draft https://github.com/radu-matei/helm
```

Before moving to actually debugging, it is worth mentioning that Helm has two components - a client-side CLI, that runs locally on the machine and a server-side component, Tiller, which is deployed in your cluster. We will debug both components.

### Debugging the Helm CLI

Debugging the Helm CLI is as simple as debugging any Golang project when using the Golang extension for VS Code and Delve - add a launch configuration and start debugging. The only thing to note here is that we can either build our binary for every change in our code, or attach to a pre-built binary - below and in the repo you'll find both configurations:

This configuration builds Helm from `cmd/helm` and attaches the debugger:
```json
{
    "name": "Build and Debug Helm CLI",
    "type": "go",
    "request": "launch",
    "mode": "debug",
    "program": "${workspaceFolder}/cmd/helm/",
    "args": [
        "version"
    ]
}
```

This configuration expects an existing binary in `bin/helm`, will launch it and attach the debugger:

```json
{
    "name": "Debug Helm CLI",
    "type": "go",
    "request": "launch",
    "mode": "exec",
    "program": "${workspaceFolder}/bin/helm",
    "args": [
        "version"
    ]
}
```

In both cases, the default command executed will be `helm version` - note that you can customize the command and arguments passed to your binary, and you can set breakpoints in your Helm CLI's code. If you select the desired configuration and start debugging (F5), the execution of `helm version` will start. If you setup breakpoints in VS Code, the execution will be stopped and you can step in, out and over method executions or evaluate expressions and variable values:

{{< youtube qUbkGq-RygM >}}

To change the command and arguments passed to the Helm CLI, simply add to the `args` property in the launch configuration.
Notice that we are debugging the local component of Helm - the `helm version` command is executed part locally (what we debugged) and part on the cluster:

```
Client: &version.Version{SemVer:"v2.8+unreleased", GitCommit:"", GitTreeState:""}
Server: &version.Version{SemVer:"v2.8.2", GitCommit:"a80231648a1473929271764b920a8e346f6de844", GitTreeState:"clean"}
```

The server version was executed in the cluster - we did not debug that call simply because we only started debugging the local component of Helm. Let's debug Tiller!

### Debugging Tiller

To debug remote components deployed in a Kubernetes cluster you need to:

- build your application for debugging (include the debugging symbols)
- create a Docker image and push it to a container registry
- update your Kubernetes manifest or Helm chart with the correct image tag, a debugger port exposed and the correct security context so the debugger can attach to a process inside your pod (in the case of NodeJS you don't have to do anything; for Go you need the `SYS_PTRACE` capability)
- wait for a pod to be running
- forward all application and debugger ports from your pod to `localhost`
- attach the local debugger to the remote target on the `localhost` port exposed by port forwarding

The entire concept of _debugging_ means that most likely you will have to to this process multiple times, which can be incredibly time consuming, repetitive and annoying. This is where Draft and the VS Code Kubernetes extension come in extremely handy - Draft will automate the process of building and pushing the container image, then releasing the new version of your application, and the VS Code Kubernetes extension makes sure to attach the correct debugger after all the ports in your pod are forwarded. Let's see how to setup the process specifically for Tiller - we will take each step above and particularize it for the current version of Helm:

### Building the Tiller binary for debugging

The [Helm's Makefile][helm-makefile] contains a target called `docker-binary` which will create a Linux binary. Since that binary is intended for production use, it will omit the debugging symbols (the `-w` flag is passed, more information below).

> Pass the '-w' flag to the linker to omit the debug information (for example, go build -ldflags=-w prog.go). - from [the Golang documentation on debugging][golang-debug]

We will not be able to use this binary for debugging, so we simply create a new Make target where we pass the desired Golang build flags:

```
.PHONY: docker-debug
docker-debug: BINDIR = ./rootfs
docker-debug:
	GOOS=linux GOARCH=amd64 $(GO) build -o $(BINDIR)/tiller k8s.io/helm/cmd/tiller
```

> For simplicity I also removed some other flags from building the binary - to be as close as possible to production, pass the desired flags, while also making sure you're not breaking the Delve debugger.

Before we get to building the image and push it to a registry, we need a way to `make docker-debug`. Draft has a feature called [Draft tasks][draft-tasks] which we will use to build the Tiller binary -  add a `.draft-tasks.toml` file which contains a `pre-up` task:

```
[pre-up]
    build-tiller = "make docker-debug"
```

> Note that if you don't want to create a new binary every time you attach the debugger you can comment the step above and simply `make docker-debug` when you want a new Tiller binary.

### Creating the Docker image, pushing it to a registry

In the repo you can find `Dockerfile.tiller.debug`, which we will use to build the container image:

```
FROM radumatei/golang-delve

COPY rootfs/tiller .
COPY rootfs/start.sh .

RUN chmod +x start.sh
CMD ./start.sh
```

- we need a base image that either contains the Golang debugger, Delve, or install it - for simplicity, we're using a pre-built image with Delve, but you can create your own base image for debugging  (**and you should!** - you don't want to trust random images from the Internet)
- we copy the Tiller binary we built before
- we also copy a shell script and use it to start the container - this script will start Tiller and attach the Delve debugger to the Tiller process, creating a headless Delve server and exposing it on port 2345:

```
./tiller &
dlv attach $(pgrep -x tiller | head -n 1) tiller --headless --listen=0.0.0.0:2345 --log=true
```

Now we need to configure a couple of things for Draft, in `draft.toml`:

```
[environments]
  [environments.development]
    name = "tiller-debug"
    namespace = "default"
    override-ports = ["2345:2345", "44134:44134", "44135:44135"]
    dockerfile = "Dockerfile.tiller.debug"
    chart = "tiller"
```

- the name and namespace of our application
- how to expose the pod's ports locally on `localhost`
- the Dockerfile and chart to use

### The Helm template for our deployment

The only missing part is the actual Kubernetes configuration for our application - here are the most important things to note in the deployment template (not the complete file!):

```
apiVersion: extensions/v1beta1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: {{ .Chart.Name }}
        securityContext:
          capabilities:
            add:
              - SYS_PTRACE
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        env:
        - name: TILLER_NAMESPACE
          value: "default"
        - name: TILLER_HISTORY_MAX
          value: "0"
        ports:
        - containerPort: {{ .Values.ports.tiller }}
        - containerPort: {{ .Values.ports.http }}
        - containerPort: {{ .Values.ports.debug }}
```

> Note that I omitted the metadata, labels and annotations for this deployment to keep only the relevant fields - use the complete file in the repo for your template!

> The ports described here are the ones used by our application, plus the debugger port for Delve, and they can be found in `values.yaml`

The thing to note for the deployment is the `SYS_PTRACE` capability - this is because `dlv attach` needs to `ptrace` the target process, and this is disabled by the default Kubernetes security context.


### Putting it all together. Start debugging with VS Code

At this point you need the Kubernetes extension for VS Code and you need to add a `draft` debug configuration, together with a Golang remote debug configuration. This will execute `draft up`, `draft connect` to expose the ports to `localhost`, then will attach the debug configuration you specified:

```json
{
    "type": "draft",
    "request": "launch",
    "name": "Draft Debug Tiller",
    "original-debug": {
        "name": "Kubernetes remote debugging",
        "type": "go",
        "request": "launch",
        "mode": "remote",
        "remotePath": "/go/src/app",
        "port": 2345,
        "host": "127.0.0.1",
        "program": "<YOUR_GOPATH>src/k8s.io/helm/cmd/tiller",
        "args": []
    }
}
```

> Remember to correctly add your `$GOPATH` in the `program` field in the configuration - this is a currently known limitation of the extension

The `original-debug` configuration is simply a Golang remote debug configuration instructing to attach the debugger on `localhost:2345` - essentially, the extension orchestrates all the steps necessary to successfully debug your application.

{{< youtube z6mWx4C3p7I>}}

Now as you saw in the video, we're attached to Tiller which is deployed in Kubernetes.

> Note that because of a current know limitation of the extension and VS Code we have to use a different window to debug the CLI - we hope to eliminate this limitation very soon, and then you will be able to use a single instance of VS Code to debug both the CLI and Tiller.

Iterating through multiple versions of your application simply means starting the Draft debug session again in VS Code - Draft will automatically build the new image for you, push it and then upgrade the deployment, and the extension will attach the remote debugger again. No more searching through the logs for errors, searching through the kubernetes resources for the name of your pods and deployments and manually starting port forwards. The VS Code Kubernetes extension will automate the entire process of deploying the new version of your application and will attach the debugger at the right time.

# Conclusion

In this article we saw how to debug a real-world application deployed on Kubernetes, Helm, and we saw how VS Code and Draft can make our lives much easier when developing, deploying and debugging applications to Kubernetes. Let me know in the comments below your thoughts, and as always, thanks for reading :)

[helm]: https://github.com/kubernetes/helm
[helm-docs]: https://docs.helm.sh
[draft]: https://github.com/azure/draft
[kubernetes-extension]: https://github.com/azure/vscode-kubernetes-tools
[golang-extension]: https://github.com/Microsoft/vscode-go
[delve]: https://github.com/derekparker/delve
[helm-branch]: https://github.com/radu-matei/helm/tree/debugging-draft
[helm-makefile]: https://github.com/kubernetes/helm/blob/master/Makefile#L59
[golang-debug]: https://golang.org/doc/gdb
[draft-tasks]: https://github.com/Azure/draft/blob/master/docs/reference/dep-008.md
