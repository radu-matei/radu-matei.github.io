+++
author = "Radu Matei"
categories = ["kubernetes", "azure"]
date = "2017-10-06"
description = "Deploy a Kubernetes 1.8 on Azure using acs-engine"
linktitle = ""
title = "Kubernetes 1.8 on Azure"
type = "post"

+++

Introduction
============

On September 28th, Kubernetes hit version 1.8 with improved support for Role Based Access Control (RBAC), TLS certificate rotation and other cool features. [You can read the full blog post that announces the release here](http://blog.kubernetes.io/2017/09/kubernetes-18-security-workloads-and.html) and you can see [the release on GitHub](https://github.com/kubernetes/kubernetes/releases/tag/v1.8.0) and the [associated changelog with all new features](https://github.com/kubernetes/kubernetes/blob/master/CHANGELOG.md#v180).

In this article we will explore how to deploy a Kubernetes cluster with version 1.8 on Azure.

If you are familiar with deploying orchestrators in Azure, or you only want to see how to deploy K8s 1.8, you can [skip the following section and go directly to where the action actually starts.](#deploy-the-cluster)

Deploying orchestrator clusters in Azure
========================================

There are a couple of ways to deploy an orchestrator cluster in Azure. First, there is Azure Container Service (that we used in the past to [deploy a Kubernetes cluster](https://radu-matei.com/blog/kubernetes-jenkins-azure/)). [Azure Container Service](https://azure.microsoft.com/en-us/services/container-service/) allows you to easily [deploy Kubernetes, Docker Swarm or DC/OS clusters from the Azure Portal or using the `az` command line](https://docs.microsoft.com/en-us/azure/container-service/). This is the way to go if you don't want to customize your cluster and you are ok with the default values that Azure provides for you.

Then there is a tool called [acs-engine](https://github.com/azure/acs-engine). This is basically the "engine" that Azure Container Service uses to deploy your clusters, and we will use it to deploy a custom version of our Kubernetes cluster, in this case the new 1.8 version.

acs-engine takes a [cluster definition file](https://github.com/Azure/acs-engine/blob/master/docs/clusterdefinition.md) where you can specify options for your cluster (like orchestrator to use - Kubernetes, Docker Swarm Mode, DC/OS and their specific versions, networking policies, master and agent profiles and others) and generates [ARM (Azure Resource Manager) templates](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-authoring-templates) that Azure uses to deploy all resources for your cluster (VMs for masters and agents with your orchestrator configured, load balancers, networking, storage adn other resources).

Because Kubernetes 1.8 has just been released, the [latest official stable release for acs-engine, v0.7](https://github.com/Azure/acs-engine/releases/tag/v0.7.0) doesn't support it yet, so will either have to build the binary yourself or use the one for Linux I already built (using the instructions below). 

Please note that if you use the binary I built you can [do the entire process from your browser using Azure Cloud Shell. Steps below :)](#using-the-azure-cloud-shell)

Building acs-engine yourself using Docker
=========================================

We will use [the official instructions on how to build acs-engine](https://github.com/Azure/acs-engine/blob/master/docs/acsengine.md), more specifically, the case when we have a Docker environment available.

First of all, clone the acs-engine repository locally on your machine:

![](/img/article-photos/k8s18-azure/clone-acs-engine.png)

Then, you need to execute a script, `./scripts/devenv.sh` (for Linux and macOS) or `.\scripts\devenv.ps1` (for Windows) that will basically start a Linux container where you will build acs-engine. This step only has to be executed once.

> Please note that this will start a priviledged container that will mount the `docker.sock` socket (among other things)!
> [See the full script here](https://raw.githubusercontent.com/Azure/acs-engine/master/scripts/devenv.sh)

So basically just execute the script that works on your OS, and then you will be left in a command line where you will: `make bootstrap` and `make build`. 

After this, you will have the binary in your repo, in the `bin` folder.

> Please note that the binary will not work on macOS or Windows (as the target OS from the build was Linux - since you can cross-compile go programs you can easily set the target for your operating system).

> Note that you are still inside the container!

![](/img/article-photos/k8s18-azure/docker-acs-engine.png)

Now you make the file executable and put in your path:

```
chmod +x bin/acs-engine
cp bin/acs-engine /gopath/bin/
```

![](/img/article-photos/k8s18-azure/path-acs-engine.png)

Now you can either see how to get this into the Azure Cloud Shell, or skip to the part where you actually deploy the cluster from within the container you're in right now.

> Note that using the instruction from GitHub you can [build acs-engine without Docker](https://github.com/Azure/acs-engine/blob/master/docs/acsengine.md#building-on-windows-osx-and-linux).

Using The Azure Cloud Shell
===========================

Using the exact same steps as presented earlier, I already [built the acs-engine binary and uploaded in a GitHub release inside this repo](https://github.com/radu-matei/acs-engine-k8s1dot8/releases/tag/0.1).

At this point you can log into your Azure Cloud Shell, you can get this binary and make it executable:

`wget https://github.com/radu-matei/acs-engine-k8s1dot8/releases/download/0.1/acs-engine`

`chmod +x acs-engine`

![](/img/article-photos/k8s18-azure/azure-acs-engine.png)

> Please note that it is not recommended to `wget` things from unofficial sources and make them executable inside your Azure Cloud Shell and you should do it at your own risk! 

Deploy the cluster
==================

Now all you need is a cluster definition file that acs-engine will use to deploy Kubernetes 1.8:


{{< gist radu-matei 7ba751e0074621313b997c12ccf28dbe >}}

The great thing about this version of acs-engine is that you will only need one command to deploy this where you pass a few parameters:

- an Azure subscription id
- a DNS prefix for your cluster
- the location of your cluster
- the cluster definition file from above

```
acs-engine deploy --subscription-id <your-subscription-id> \
    --dns-prefix <your-dns-prefix> --location westeurope \
    --auto-suffix --api-model kubernetes18.json
```

Now simply execute this (be careful if the binary is not in the path - ./acs-engine), you will need to authenticate using the device login and that is about it.

> Note the "orchestratorRelease" property in the JSON file set to 1.8!
> Note that it automatically creates all assets for you includeing a service principal and a resource group.

![](/img/article-photos/k8s18-azure/shell.png)

After the deployment succeeds, you should see a resource group in your subscription with all your Kubernetes assets:

![](/img/article-photos/k8s18-azure/resource-group.png)


The output of the command above is an `_output` folder where you have your SSH keys and the `kubeconfig` to access the cluster.

Now to access the cluster.

> Note that if your are using the container from acs-engine, you should have kubectl (version 1.7)
> If you are using Azure Cloud Shell (or want to upgrade your kubectl version), simply [follow the instructions here](https://kubernetes.io/docs/tasks/tools/install-kubectl/)


Now you need to point your `kubectl` to the `kubeconfig` file location. This has to correspond to the Azure location where you deployed your cluster - in my case West Europe:

`export KUBECONFIG=_output/k8s1dot8-59d7bcf0/kubeconfig/kubeconfig.westeurope.json`

`kubectl get nodes`

![](/img/article-photos/k8s18-azure/18.png)

Note that you have a Kubernetes 1.8 cluster on Azure and you can benefit from the awesome features 1.8 brings!

And from the Azure Cloud Shell:
![](/img/article-photos/k8s18-azure/shell.png)
![](/img/article-photos/k8s18-azure/azure.png)


Conclusion, feedback wanted :)
===============================

In this brief article we saw how to deploy a Kubernetes 1.8 cluster on Azure by building acs-engine ourselves.

If you have any ideas, comments or feedback, please use the comments below :)