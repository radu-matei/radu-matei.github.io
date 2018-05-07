+++
author = "Radu Matei"
categories = ["kubernetes"]
date = "2018-05-05"
description = "What is the state of remote debugging microservices on Kubernetes? How do most people solve their issues, what tools do they use and how can we make this easier?"
linktitle = ""
featured = "GopherKubernetes.png"
featuredpath = "/img/article-photos/state-of-debugging-microservices-on-k8s/"
title = "The state of debugging microservices on Kubernetes"
type = "post"
summary = ""
+++

> Credit for the image goes to [Ashley McNamara's awesome Gopher collection][gophers]

### Where are we? How did we get here?

For as long as we have been writing software, we have also introduced bugs in our applications. Back when we were developing monoliths, we could simply start the IDE of choice, add a couple of breakpoints, step through the code and _hopefully_ solve the issue. There was a single place where the application was running, where logs were visible and where the application could be diagnosed.

> Everyone knows that debugging is twice as hard as writing a program in the first place. So if you're as clever as you can be when you write it, how will you ever debug it? - ["The Elements of Programming Style"][programming-style], 2nd edition

But for the most part, we're no longer writing monoliths, but microservices, with containers and Kubernetes as the clear platform of choice for developing and deploying them. And this has allowed us to break down incredibly complex solutions into smaller, easier to understand components, often written in multiple languages, with multiple teams independently contributing to different parts of the system, enabling true continuous delivery.

Having a distributed solution with that many moving parts (ingresses, services, deployments, pods, containers, secrets, external services and more) means that accurately pinpointing a problem becomes significantly harder - and as a community, we have been developing really great tools for externalized and centralized logging, metrics and tracing, with the appearance of so many service mesh projects (Istio, Linkerd, Envoy, Conduit and many others) giving us articles such as - [Which service mesh should I use?][what-service-mesh]

When we identify a service as not working properly, we start our journey by first restarting the pods, hoping this will fix the issue.

{{< img-post "/img/article-photos/state-of-debugging-microservices-on-k8s" "turning-off.gif" "Turning off" "center" >}}


When that doesn't work, we proceed to adding a bunch of print statements in our code, rebuild the container image, push it to a registry, then update the deployment manifest with the new tag.
With the new information, we proceed to making a few changes, rebuild and push the image, update the deployment's image tag and hope for the best. Repeat until the problem goes away.

[This article from 2001 - Are you still using print statements for debugging? There are more effective ways to debug your Java code][printlines] - pointed out how there were better ways of debugging. Yet in 2018, we're forced to use the same technique that was considered outdated seventeen years ago! Don't we have any better solutions?

### Popular debugging solutions on Kubernetes

> There are existing cloud-hosted services that support debugging - but in this article we're interested in open-source solutions that run on any Kubernetes cluster. Both Google and Microsoft have services in preview that allow the users of their managed Kubernetes cluster to attach a debugger:

 > - [Announcement of Azure Dev Spaces for Kubernetes][dev-spaces] 
 > - [How to use the Stackdriver debugger on Google Cloud Platform][stackdriver-debugger]


One of the most popular open source projects in the space of remote debugging on Kubernetes is [Squash][squash].

> Squash brings the power of modern popular debuggers to developers of microservices apps that run on container orchestration platforms. Squash bridges between the orchestration platform (without changing it) and IDE. Users are free to choose which containers, pods, services or images they are interested in debugging, and are allowed to set breakpoints in their codes, follow values of their variables on the fly, step through the code while jumping between microservices, and change these values during run time.

The experience in [Idit's KubeCon Austin talk about Squash][squash-talk] is amazing! Being able to debug multiple microservices at the same time while stepping through code, evaluating expressions and variables is really awesome! However, the issue most people have with Squash is that _the Squash client shares the host PID namespace (and hence can see all processes on the node, making them available to be debugged)._ Specifically, it means that you need to deploy (among other services) a Kubernetes `DaemonSet` that runs on each node, which is privileged and mounts the container runtime socket - here's the [Squash client deployment][squash-client].

While the technology is really awesome and beautifully put together, having a privileged service running on each node, able to see all processes on all nodes will turn some people away.

So what does it take to debug services on _any_ Kubernetes cluster, without exposing all running processes on the cluster nodes?

### How to debug applications on Kubernetes

Right now, to debug a Kubernetes service we need to:

- build the application for debugging (include the debugging symbols along with the binary)
- create a container image (include the debugger) and push it to a container registry
- update the Kubernetes manifest or Helm chart with the correct image tag, a debugger port exposed and the correct security context so the debugger can attach to a process inside your pod 

> This varies from language to language - in NodeJS simply start the process and pass the `--inspect` flag. For Golang, you need to have the `CAP_SYS_PTRACE` capability for the container running your debugger, so it can `ptrace` the application process.

> Alternatively, you can directly start the process through the debugger, although this means a different process will be the main process in the container. You can also `exec` inside the container and start the debugging process before attaching the remote debugger - imperatively making changes to your containers means you no longer have immutable components, and replicating different behaviors becomes more difficult.

- wait for a pod to be running
- forward all application and debugger ports from your pod to `localhost`
- attach the local debugger to the remote target on the `localhost` port exposed by port forwarding

Of course all the steps can be performed manually - and some people have been doing it, some more successfully than others. It is simply not viable to think people are willing to make all the steps manually.

Surely, there are existing tools that simplify parts of the experience: 

- [KSync][ksync] synchronizes the file system inside your container and works great with interpreted languages
- [Telepresence][telepresence] redirects traffic from the cluster to your local machine 
- [Draft][draft] and [Skaffold][skaffold] help with the process of consistently redeploying your application on each change. 

> For an introduction to the tools mentioned above, see [Joe Beda's TGI Kubernetes series][joe-tgik].

But taken independently, none of them provide an end-to-end experience to actually debugging multiple microservices in Kubernetes.
This is exactly what we're orchestrating with the [VS Code Kubernetes extension][vscode-kubernetes] and [Draft][draft] - allowing us to enable the experience for _any_ Kubernetes cluster, bringing the code editor - the place we're spending most of our time writing the application - back to a place where it has access to all components, logs, traces and break points and can initiate the debugging session through a single command.

For an early preview of what the experience feels like right now, here's the keynote demo from KubeCon Copenhagen 2018:


{{< youtube 0sh2aWdfBxA >}}

Here's what happened in the demo: using the VS Code Kubernetes extension, Helm and Draft, we are able to start two microservices, one written in Golang, one in NodeJS, create and push the container images, deploy them to Kubernetes using Helm, then attach the debuggers for Golang and NodeJS using VS Code. Then, as we make requests to our application, we can step through the NodeJS service, which creates requests to the Golang service - and we're able to debug that as well. Technically, we can chain as many services as we have in our system, although the the experience needs improvements on that (particularly on using a single VS Code instance).

> To see how debugging a real-world application looks like, [here's how to use the same tools to debug Helm and Tiller.][debug-helm-tiller]

### Well, how _should_ we debug microservices in Kubernetes?

Kubernetes 1.10 introduced an [alpha-feature allowing us to share the process namespace between containers in a pod][shared-pid-namespace] - this means we can have the application in `containerA` and the debugger, with the exposed ports and security context in `containerB`.
The shared PID namespace is needed so that the debugger in `container B` can attach to a process in `containerA`, the application process, allowing us to have the `containerA` image very close (if not exactly the same as) to the production image.

> To enable feature gates in Kubernetes on Azure, you can use [`acs-engine` with a cluster template][acs-engine-feature-gates] and pass the specific feature gate you need.

> In Google Cloud Platform, you can use [Alpha clusters][gcp-alpha-clusters].

> It is generally not recommended to run Kubernetes alpha features in production, but for use only in short-lived testing clusters, due to increased risk of bugs and lack of long-term support.

Once we have a cluster with Kubernetes 1.10 and `--feature-gates=PodShareProcessNamespace=true`, we can create a pod where we share the process namespace between the containers:

```
apiVersion: v1
kind: Pod
metadata:
  name: <your-pod>
spec:
  shareProcessNamespace: true
  containers:
  - name: containerA
    image: <your-application-image>
  - name: containerB
    image: <your-debugger-image>
    securityContext:
      capabilities:
        add:
        - SYS_PTRACE
    ports:                              
    - containerPort: <application-port>
    - containerPort: <debugging-port>
```
> As mentioned earlier, some debuggers need to `ptrace` the process in order to successfully attach - some container runtimes disable by default the `SYS_PTRACE` capability, so we need to pass it to the container security context.

Going for alpha in 1.11 is a feature used to [Troubleshoot Running Pods][debug-container] - this will allow us to **temporarily** attach a container that has the debugger, the correct security context and the exposed ports for debugging - we then will attach the appropriate VS Code debugger, and when we're done, the container with the debugger will be killed.
This comes with all of the benefits above, plus our `container B` will only run temporarily, while the debugger is attached in our IDE, having exposed ports and elevated security contexts only for the duration of the debugging session.

```
kubectl debug  --image=<your-debugger-image> <your-application-pod>
```
While this command is running we can start the debugging session, attach the debugger and understand the behavior of our application. When we disconnect the debugger, the container with the debugger will be killed, and our application returns to its normal. Imagine integrating this command in the regular `Start Debugging` workflow that we currently have with VS Code and Draft, and you have a pretty good idea of how the workflow will look in the not-so-distant future.

> Keep in mind that this feature is not yet released in Kubernetes, so probably the actual commands will change, but the end result should remain fairly similar.

The biggest challenge is working towards having the debugging artifacts (container images and deployment manifests) as close to the production artifacts as possible. This will minimize the not so few cases where an issue appears in production but not in development, allowing us to attach debuggers to already running pods and, in extreme cases, even attach a debugger to a production pod (although, as previously mentioned, not advised).

### How to get involved

Give [Draft][draft] and the [VS Code Kubernetes][vscode-kubernetes] extension a try!

While there are lots of things to be improved, the process of developing, debugging and deploying microservices on Kubernetes is getting easier, faster. 


[gophers]: https://github.com/ashleymcnamara/gophers

[what-service-mesh]: https://thenewstack.io/which-service-mesh-should-i-use/
[programming-style]: https://www.amazon.com/Elements-Programming-Style-2nd/dp/0070342075
[printlines]: https://www.javaworld.com/article/2074974/learn-java/are-you-still-using-print-statements-for-debugging-.html
[designing-distributed-systems]: https://azure.microsoft.com/mediahandler/files/resourcefiles/baf44271-3870-454f-868c-23d48e7672cb/Designing_Distributed_Systems.pdf

[dev-spaces]: http://landinghub.visualstudio.com/devspaces
[stackdriver-debugger]: https://cloud.google.com/debugger/docs/quickstart

[squash]: https://github.com/solo-io/squash
[squash-talk]: https://www.youtube.com/watch?v=5TrV3qzXlgI
[squash-client]: https://github.com/solo-io/squash/blob/master/contrib/kubernetes/squash-client.yml

[shared-pid-namespace]: https://kubernetes.io/docs/tasks/configure-pod-container/share-process-namespace/
[debug-container]: https://github.com/kubernetes/community/blob/master/contributors/design-proposals/node/troubleshoot-running-pods.md

[debug-helm-tiller]: https://radu-matei.com/blog/debug-helm-tiller/

[ksync]: https://github.com/vapor-ware/ksync
[telepresence]: https://github.com/datawire/telepresence
[draft]: https://github.com/Azure/draft
[skaffold]: https://github.com/GoogleContainerTools/skaffold

[joe-tgik]: https://www.youtube.com/watch?v=9YYeE-bMWv8&list=PLvmPtYZtoXOENHJiAQc6HmV2jmuexKfrJ

[vscode-kubernetes]: https://github.com/Azure/vscode-kubernetes-tools

[acs-engine-feature-gates]: https://github.com/Azure/acs-engine/blob/master/examples/feature-gates/kubernetes-featuresgates.json
[gcp-alpha-clusters]: https://cloud.google.com/kubernetes-engine/docs/concepts/alpha-clusters