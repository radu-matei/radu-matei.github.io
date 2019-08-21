+++
author = "Radu Matei"
categories = ["kubernetes"]
date = "2019-08-21"
description = ""
linktitle = ""
title = "Running Kubernetes end-to-end tests with Kind and GitHub Actions"
type = "post"
featured = "kind-github.png"
featuredpath = "/img/article-photos/kubernetes-e2e-github-actions/"
summary = "Using Kubernetes in Docker in GitHub Actions"
images = ["/img/article-photos/kubernetes-e2e-github-actions/kind-github.png"]
+++

# Introduction

> [Kind, or Kubernetes In Docker][kind], is a tool for running local Kubernetes clusters using a Docker daemon to configure the Kubernetes nodes and control plane. It has become one of the easiest ways of running a local or development Kubernetes cluster (when compared to configuring Kubernetes in a virtual machine, Minikube, Docker Desktop, or running a cluster in the cloud).

> For a [quick guide to Kind, visit the official documentation][kind-quick-start] - essentially, with the `kind` binary and a Docker daemon, all you have to do is run `kind create cluster`, and you get a 1 node Kubernetes cluster.

A few weeks ago, I wrote an [article about running Kind in a Kubernetes cluster][kind-brigade]. But you don't need to have an existing Kubernetes cluster in order to use Kind - you can [configure your favorite CI][kind-ci-examples] to start a cluster using Kind, and in this short article, we'll have a look at how to use the latest beta of GitHub Actions to do this.

> If you're not in the GitHub Actions beta already, [you can sign up here][beta].

# TL; DR - It just works

Because GitHub Actions workers have a Docker daemon pre-configured, starting a Kubernetes cluster using Kind is straightforward - so let's see how the configuration looks like:

```yaml
name: Kind
on: [push, pull_request]

jobs:
  kind:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@master
    - name: Kind
      run: |
        export GOBIN=$(go env GOPATH)/bin
        export PATH=$PATH:$GOBIN
        mkdir -p $GOBIN

        curl -LO https://storage.googleapis.com/kubernetes-release/release/`curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt`/bin/linux/amd64/kubectl
        chmod +x kubectl
        mv kubectl $GOBIN
        wget https://github.com/kubernetes-sigs/kind/releases/download/v0.5.0/kind-linux-amd64
        chmod +x kind-linux-amd64 && mv kind-linux-amd64 $GOBIN/kind

        kind create cluster --wait 300s
        export KUBECONFIG="$(kind get kubeconfig-path)"
        kubectl wait --for=condition=Ready pods --namespace kube-system
        kubectl cluster-info
        kubectl get pods -n kube-system
```

> Note that you don't need to place the `kind` and `kubectl` binaries in any particular directory, just one that is in the `$PATH`.

Breaking down the the configuration file, we have:

- a workflow called `Kind`
- it runs on all `push` or `pull_request` events
- with one job, `kind`, which runs on `ubuntu-latest` (Ubuntu 18.04)
- checkout the source code
- get the `kind` and `kubectl` binaries
- `kind create cluster`
- wait for the cluster to come up

The only slightly interesting thing we're doing here is waiting for the cluster to be ready - `kind create cluster --wait` waits until the resources are ready, but just to be sure (and to show you how to wait for resources in a given namespace so you might use it later), we wait for all pods in `kube-system` to be in a _Ready_ state using `kubectl`.
```
 ✓ Installing StorageClass 💾
 ✓ Waiting ≤ 5m0s for control-plane = Ready ⏳
 ✓ Ready after 53s 💚

pod/coredns-5c98db65d4-658bm condition met
pod/coredns-5c98db65d4-bjcfh condition met
pod/kindnet-wdglm condition met
pod/kube-proxy-7gd45 condition met

Kubernetes master is running at https://127.0.0.1:33687
KubeDNS is running at https://127.0.0.1:33687/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
NAMESPACE     NAME                       READY   STATUS    RESTARTS   AGE
kube-system   coredns-5c98db65d4-658bm   1/1     Running   0          47s
kube-system   coredns-5c98db65d4-bjcfh   1/1     Running   0          47s
kube-system   kindnet-wdglm              1/1     Running   1          47s
kube-system   kube-proxy-7gd45           1/1     Running   0          47s
```

> Note that depending on your cluster configuration you might have to wait for additional resources to be in a _Ready_ state before using it.

# Using Helm 3

Now that the cluster is ready, you can start configuring your usual toolchain - let's see how we would use the latest Helm 3 pre-release (yay for [no more Tiller][helm-blog]):

```
export HELM_PLATFORM=linux-amd64 && export HELM_VERSION=helm-v3.0.0-alpha.2
wget https://get.helm.sh/$HELM_VERSION-$HELM_PLATFORM.tar.gz && tar -xvzf $HELM_VERSION-$HELM_PLATFORM.tar.gz && rm -rf $HELM_VERSION-$HELM_PLATFORM.tar.gz && mv $HELM_PLATFORM/helm $GOBIN/helm3 && chmod +x $GOBIN/helm3
helm3 init && helm3 repo update && helm3 install ni stable/nginx-ingress
kubectl get pods
```

> Note that if you're using Helm 2, [it already comes configured on the GitHub workers][software-workers].


In this example, we just install a chart from the stable repository:


```
$HELM_HOME has been configured at /home/runner/.helm.
Happy Helming!
Hang tight while we grab the latest from your chart repositories...
...Successfully got an update from the "stable" chart repository
Update Complete. ⎈ Happy Helming!⎈ 

NAME: ni
LAST DEPLOYED: 2019-08-21 10:24:48.635109582 +0000 UTC m=+1.216598463
NAMESPACE: default
STATUS: deployed

NOTES:
The nginx-ingress controller has been installed.
It may take a few minutes for the LoadBalancer IP to be available.
You can watch the status by running 'kubectl --namespace default get services -o wide -w ni-nginx-ingress-controller'

If TLS is enabled for the Ingress, a Secret containing the certificate and key must also be provided:

  apiVersion: v1
  kind: Secret
  metadata:
    name: example-tls
    namespace: foo
  data:
    tls.crt: <base64 encoded cert>
    tls.key: <base64 encoded key>
  type: kubernetes.io/tls

NAME                                                READY   STATUS              RESTARTS   AGE
ni-nginx-ingress-controller-64845d9cd4-fzqjt        0/1     ContainerCreating   0          0s
ni-nginx-ingress-default-backend-77f8c99775-smr4p   0/1     ContainerCreating   0          0s
```

If your workload is using a persistent volume, the deployment will currently fail, [since Kind does not have support for dynamic volume provisioning][kind-pvc], which is planned for the next version.

# Conclusion

Running Kind in GitHub Actions is straightforward - get the right binaries, create a cluster, then configure your usual toolchain. 
Thanks for reading!

[kind]: https://kind.sigs.k8s.io/
[kind-quick-start]: https://kind.sigs.k8s.io/docs/user/quick-start/
[kind-ci-examples]: https://github.com/kind-ci/examples
[kind-brigade]: https://radu-matei.com/blog/kubernetes-e2e-kind-brigade/
[beta]: https://github.com/features/actions/signup/
[helm-blog]: https://helm.sh/blog/helm-3-preview-pt2/
[software-workers]: https://help.github.com/en/articles/software-in-virtual-environments-for-github-actions
[kind-pvc]: https://github.com/kubernetes-sigs/kind/issues/118
