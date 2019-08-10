+++
author = "Radu Matei"
categories = ["kubernetes", "brigade"]
date = "2019-08-10"
description = "How to set up end-to-end jobs in your cluster with Kind and Brigade"
linktitle = ""
title = "Running end-to-end tests on your Kubernetes cluster with Kind and Brigade"
type = "post"
featured = "kind-brigade.png"
featuredpath = "/img/article-photos/kubernetes-e2e-kind-brigade/"
+++

# What is Kind?

[Kind, or Kubernetes In Docker][kind], is a tool for running local Kubernetes clusters using a Docker daemon to configure the Kubernetes nodes and control plane. It has become one of the easiest ways of running a local or development Kubernetes cluster (when compared to configuring Kubernetes in a virtual machine, Minikube, Docker Desktop, or running a cluster in the cloud).

> For a [quick guide to Kind, visit the official documentation][kind-quick-start] - essentially, with the `kind` binary and a Docker daemon, all you have to do is run `kind create cluster`, and you get a 1 node Kubernetes cluster.

# End-to-end testing in Kubernetes

If you're developing an application that will be deployed on Kubernetes, you want to actually deploy it on a cluster as part of your continuous integration pipeline, ideally on each pull request. So how would you approach this?

Because of its simplicity and easy setup, Kind is also suitable for running in continuous integration environments - to see sample configurations for running Kind in popular CI/CD platforms such as CircleCI, Travis, or Azure Pipelines, [visit this repository][kind-ci-examples].

But what if you're running your build pipelines _in a Kubernetes cluster_? One option could be to deploy your application on a new namespace, side-by-side the other workloads in the cluster. That works well if the application is contained in a simple namespace and it doesn't interact with the rest of the cluster in a disruptive way - but if you want to isolate the test even more, and run a dedicated cluster with no other workloads and configuration, running Kind might be a good option.

# Configuring Kind in a Kubernetes pod

> **DANGER**

> While configuring Kind locally, or in a CI environment is straightforward, running in a Kubernetes pod is not that well documented, and bad configuration could potentially harm your cluster. Test all of the instructions presented here before running them in any production cluster, and monitor your environments for potential resource leaks. 

> For the ongoing discussion on documenting Kind in a Kubernetes pod, [see this issue][kind-303].

> For the discussion about the potential resource leaks, [see this issue][kind-759].

> The configuration for running Kind in a pod will need a privileged context, and will mount host path volumes for `/sys/fs/cgroup` and `/lib/modules` from your actual Kubernetes node - so again, **proceed with care and at your own risk**.

Now that we got the disclaimer out of the way, let's see how to run Kind in a pod:

```
apiVersion: v1
kind: Pod
metadata:
  name: kind
spec:
  containers:
    - name: kind
      image: radumatei/golang-kind:1.11-0.4
      securityContext:
        privileged: true
      volumeMounts:
        - mountPath: /lib/modules
          name: modules
          readOnly: true
        - mountPath: /sys/fs/cgroup
          name: cgroup
        - name: dind-storage
          mountPath: /var/lib/docker
  volumes:
  - name: modules
    hostPath:
      path: /lib/modules
      type: Directory
  - name: cgroup
    hostPath:
      path: /sys/fs/cgroup
      type: Directory
  - name: dind-storage
    emptyDir: {}
```

Things to note here:

- the container image used is `radumatei/golang-kind:1.11-0.4` - it is based on `docker:dind`, and adds Go 1.11 and Kind 0.4. I highly recommend you build your own image ([see this Gist with the Dockerfile for this image][dockerfile-gist]), and never trust random strangers from the Internet with running their images in privileged pods in your cluster.

- the pod needs to run in a privileged security context for Docker in Docker to start.
- the pod needs to a volume mounted at `/var/lib/docker` to correctly bootstrap the cluster ([see this issue comment for more context][kind-var-lib-docker]), as well as mounting `/lib/modules` and `/sys/fs/cgroup` from the host node (this is yet to be fully documented, [see this issue][kind-303]).
- because of the privileged context and host mounts, you should isolate the node where this is running, and treat it as insecure.
- when finished, always execute `kind delete cluster` to free the resources used by the cluster and avoid resource leaks (see [this issue][kind-759]).

At this point, you would need to take this configuration and automate creating the pod, then actually running your end-to-end testing. Thankfully, Brigade can help us with this part!

# Running Kind jobs with Brigade

> [Brigade][brigade] is a lightweight Kubernetes-native framework for event-driven scripting. It allows you to respond to certain events (such as a push in a repository, or a custom webhook) and execute a JavaScript script that controls the flow of executing tasks in Kubernetes pods, while also simplifying how to share storage between the jobs, add caches, or handle errors in jobs.

> Check the following sessions from KubeCon Barcelona 2019 for [Introduction to Brigade][intro] and a [Deep Dive to Brigade][deep-dive].

> Note that the following configuration will work with Brigade 1.2, which is not yet released at the time of writing this article. Check out the [releases page in GitHub][releases].

> For example, the following `brigade.js` file will execute the two `echo` tasks in an `alpine` container on each `exec` event received by Brigade:

> ```javascript
const { events, Job } = require("@brigadecore/brigadier");
events.on("exec", () => {
  var job = new Job("do-nothing", "alpine:3.8");
  job.tasks = [
    "echo Hello",
    "echo World"
  ];

  job.run();
});
```
> Check these resources for [a Brigade scripting guide][guide] and an [advanced scripting guide][advanced].

Brigade allows us to control the flow of executing tasks in containers in Kubernetes pods - so we can take the Kind configuration, and completely abstract it with a [custom Brigade job][utils].

```javascript
const { KindJob } = require("@brigadecore/brigade-utils");
function e2e(event, project) {
    let kind = new KindJob("kind");
    kind.tasks.push(
        // add your end-to-end tests
        "kubectl get pods --all-namespaces"
    );
    return kind;
}
events.on("exec", e2e);
```

The [`KindJob` class][kind-class] creates the pod configuration described earlier:

- runs as a privileged pod
- mounts the correct volumes to the pod
- starts the Docker daemon
- creates a 1-node Kind cluster and sets the `kubectl` context accordingly
- ensures that the resource cleanup is always executed regardless of th exit code of your actual tasks.

Additionally, the Brigade project must allow privileged jobs and host mounts.

That being said, **all warnings for running Kind in a privileged pod apply, and you should be extremely careful and monitor your environment**.

Now you can add your own tasks through `kind.tasks.push("your-tasks")` - you can start deploying your application, configure Helm and install Helm charts, or use any Kubernetes tools you might use for CI.

> Note that dynamic volume provisioning doesn't currently work in Kind ([see this issue][pvc]).

Note that you an also completely change the configured tasks - [check out how the steps are configured, and always ensure to delete the Kind cluster even when your tasks fail (by default, we are using Linux traps)][kind-class].

Sample output from running the job:

```
time="2019-08-09T20:24:41.801448759Z" level=info msg="Starting up"
time="2019-08-09T20:24:48.589831337Z" level=info msg="Daemon has completed initialization"
time="2019-08-09T20:24:49.497015690Z" level=info msg="API listen on [::]:2376"
time="2019-08-09T20:24:49.497119288Z" level=info msg="API listen on /var/run/docker.sock"
Creating cluster "kind" ...
 ✓ Ensuring node image (kindest/node:v1.15.0) 🖼
time="2019-08-09T20:28:03.256888458Z" level=info msg="shim containerd-shim started" address="/containerd-shim/moby/7e3918831faeaf1e7992ba07c72ff6c245b2cdeeb21c3c374b7758bb362294ad/shim.sock" debug=false pid=401 
 ✓ Preparing nodes 📦
 ✓ Creating kubeadm config 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
 ✓ Waiting ≤ 5m0s for control-plane = Ready ⏳
 • Ready after 1m1s 💚
Cluster creation complete. You can now use the cluster with:
export KUBECONFIG="$(kind get kubeconfig-path --name="kind")"

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
NAMESPACE     NAME                                         READY   STATUS              RESTARTS   AGE
kube-system   coredns-5c98db65d4-5f7n7                     0/1     ContainerCreating   0          52s
kube-system   coredns-5c98db65d4-rpjld                     0/1     ContainerCreating   0          52s
kube-system   kindnet-zndzp                                1/1     Running             1          53s
kube-system   kube-controller-manager-kind-control-plane   1/1     Running             0          13s
kube-system   kube-proxy-lnj2s                             1/1     Running             0          53s
```

# Conclusion

We've seen how to configure Kind to run in a pod in a Kubernetes cluster, and how to abstract all of the configuration and automate running jobs by simply instantiating a `KindJob` object.

Check out the [instructions in the Brigade utils library on how to add it to your Brigade project][utils], and stay tuned for the release of Brigade 1.2!

[kind]: https://kind.sigs.k8s.io/
[kind-quick-start]: https://kind.sigs.k8s.io/docs/user/quick-start/
[kind-ci-examples]: https://github.com/kind-ci/examples
[kind-303]: https://github.com/kubernetes-sigs/kind/issues/303
[kind-759]: https://github.com/kubernetes-sigs/kind/issues/759
[dockerfile-gist]: https://gist.github.com/radu-matei/
[kind-var-lib-docker]: https://github.com/kubernetes-sigs/kind/issues/625#issuecomment-505184948
[pvc]: https://github.com/kubernetes-sigs/kind/issues/118

[brigade]: https://brigade.sh
[intro]: https://www.youtube.com/watch?v=NTeJzvtiLWo
[deep-dive]: https://www.youtube.com/watch?v=Sd9S6GhUiwM
[releases]: https://github.com/brigadecore/brigade/releases
[guide]: https://docs.brigade.sh/topics/scripting/
[advanced]: https://docs.brigade.sh/topics/scripting_advanced/
[utils]: https://github.com/brigadecore/brigade-utils
[kind-class]: https://github.com/radu-matei/brigade-utils/blob/kind/src/kind.ts