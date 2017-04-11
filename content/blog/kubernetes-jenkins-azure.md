+++
author = "Radu Matei"
categories = ["docker", "kubernetes", "jenkins", "azure"]
date = "2017-04-11"
description = ""
linktitle = ""
title = "Creating a CI/CD workflow with Kubernetes, Jenkins and Azure Container Service"
type = "post"

+++

Table of Contents
------------------

- [Introduction](#introduction)
- [Deploying a Kubernetes cluster on Azure Container Service](#deploying-a-kubernetes-cluster-on-azure-container-service)
- [Installing and configuring the Kubernetes CLI](#installing-and-configuring-the-kubernetes-cli)
- [Deploying a Jenkins master on the cluster](#deploying-a-jenkins-master-on-the-cluster)
- [Configuring Jenkins to work with Kubernetes](#configuring-jenkins-to-work-with-kubernetes)
- [Configuring Jenkins to dinamically spawn agents (Docker containers) for builds](#configuring-jenkins-to-dinamically-spawn-agents-docker-containers-for-builds)
- [What is happening behind the scenes?](#what-is-happening-behind-the-scenes)
- [The Docker image for the slaves](#the-docker-image-for-the-slaves)
- [Conclusion](#conclusion)
- [Next Steps](#next-steps)
- [Feedback](#feedback)

Introduction
-------------


[If you already know how to deploy a Kubernetes cluster, please jump ahead to creating the Jenkins service.](http://localhost:1313/blog/kubernetes-jenkins-azure/#deploying-a-jenkins-master-on-the-cluster)

The purpose of writing this article is to show how to deploy and configure a Kubernetes cluster on Azure Container Service and install the Jenkins master as a Kubernetes service that will spawn slaves to build your workloads.

You can, of course, install Jenkins in a VM, but you loose all the flexibility that running Kubernetes gives you. 

Only the master will run continously to receive webhooks and to spawn (not sure if this is the right word :D) slaves (these will be also Docker containers) to build and deploy your updates.


Deploying a Kubernetes cluster on Azure Container Service
-----------------------------------------------------------

The easiest way (in my opinion) to deploy a Kubernetes cluster is through [the new Azure CLI 2.0](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli).
Since you are reading an article about Kubernetes, I will go ahead and assume you are familiar with Docker, so I will use the Docker option to use the Azure CLI:

`docker run -it -p 81:8080 azuresdk/azure-cli-python bash`

> The reason I also mapped port 81 on the host (you can choose any available port on your machine) to port 8080 on the container (again, your choice) is because later we will create a proxy that will allow us to see the Kubernetes Dashboard. More on this later.

> You can find [the Dockerfile for this image here](https://github.com/Azure/azure-cli/blob/master/Dockerfile)

Now you have a container with the new `az` command line. First thing to do  - login to your Azure account using 

`az login`  

After following the instructions in the command line (open a browser, go to http://aka.ms/devicelogin and paste the code from the console), you are ready to explore your Azure resources from the command line.

In order to verify that the desired subscription is the default one (in case you have multpile subscriptions), you can execute

`az account show` 

If it is not, you can change it by using

`az account set --subscription {subscription-id}`. 

Now if you execute `az account show`, you will see the one you selected.

The first thing you shoud do before actually deploying the Kubernetes cluster is create a [resource group](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-overview#resource-groups). This is done by executing the following command: 

`az group create --name kubernetes-jenkins --location westeurope`

> Note that you can select [the closest Azure region](https://azure.microsoft.com/en-us/regions/) to you when passing the parameter to `--location`.

This is how it should look like if the deployment succeeded:

![](/img/article-photos/kubernetes-jenkins-azure/az-group-show.png)

At this point, you are ready to actually deploy the Kubernetes cluster:


`az acs create --orchestrator-type=kubernetes --resource-group=kubernetes-jenkins-ci --name=kubernetes-jenkins --dns-prefix=kubernetesci --generate-ssh-keys`

> Note that these instructions are also available on [the official documentation for Kubernetes on Azure Container Service](https://docs.microsoft.com/en-us/azure/container-service/container-service-kubernetes-walkthrough#create-your-kubernetes-cluster).

This will create a new Azure Container Service deployment in the resource group `kubernetes-jenkins` with the name `kubernetes-jenkins`, KLubernets as orchestrator and the DNS prefix of the master and nodes `kubernetesjenkins`.

> Note that this command will take around 10 minutes to complete.

At this point, you can either see the deployed resources from the command line by executing

`az acs show --resource-group kubernetes-jenkins --name kubernetes-jenkins`

Or by going to the [Azure Portal](https://portal.azure.com) to the Container Services blade:

![](/img/article-photos/kubernetes-jenkins-azure/acs-cluster-portal.png)

You can also see everything that got deployed for you (virtual machines, availability sets, storage accounts, network interfaces, network security groups, virtual networks, load balancers and route tables) by inspecting the resource group in the portal:

![](/img/article-photos/kubernetes-jenkins-azure/resource-group.png)

Installing and configuring the Kubernetes CLI
----------------------------------------------

Next, you install the Kubernetes CLI, [`kubectl`](https://kubernetes.io/docs/user-guide/kubectl-overview/) by executing 

`az acs kubernetes install-cli` 

> [Since the Azure CLI is developed openly on GitHub, you can see exactly how the Azure CLI downloads and installs `kubectl` here](https://github.com/Azure/azure-cli/blob/master/src/command_modules/azure-cli-acs/azure/cli/command_modules/acs/custom.py#L273).

Then, you get the credentials for the cluster: 

`az acs kubernetes get-credentials --resource-group=kubernetes-jenkins --name=kubernetes-jenkins`

> By deploying Kubernetes through Azure Container Service, the `az` utilitary can manage the cluster credentials for you, but you can also use the configuration file you can find in `~/.kube/config`

Now, you are ready to use `kubectl` as usual: `kubectl get nodes`.

![](/img/article-photos/kubernetes-jenkins-azure/kubectl-get-nodes.png)

> For a more detailed walkthrough on creating the cluster and creating your first public services, make sure to [complete this tutorial](https://docs.microsoft.com/en-us/azure/container-service/container-service-kubernetes-walkthrough).


Deploying a Jenkins master on the cluster
------------------------------------------

First of all, you need a `jenkins-master.yml` file that describes the Jenkins service with persistent storage, public and private endpoints and resource limits. In order to get this file, simply execute the following command that will download the file from my Gist account:

`wget https://gist.githubusercontent.com/radu-matei/ccec29e108d0e01f50c8c1ea45a1dc58/raw/c32078736352dee3dbcf75e05f86fe801a4defe4/jenkins-master.yaml`


> This file is based on the [Jenkins documentation on deploying to Google Container Engine from GitHub](https://github.com/jenkinsci/kubernetes-plugin/blob/master/src/main/kubernetes/gke.yml).

This deployment will create a new namespace for the services, `kubernetes-plugin` and will create the Jenkins master service based on the [jenkins:latest](https://hub.docker.com/r/jenkinsci/jenkins/) Docker image, and will expose ports 8080 (for the web interface) and 50000 (for communicating with the slaves), among with a persistent storage.

> Take care when using the `:latest` tag for images!

`kubectl create -f jenkins-master.yaml`

Besides the containers and services this `.yaml` file creates, there is also some persistent storage. If we look at the `jenkins-master.yaml` in the persistent storage part, we can see that at some point, the original `gke.yaml` creates a [`gcePersistentDisk`](https://kubernetes.io/docs/concepts/storage/volumes/#gcepersistentdisk), which is Google Cloud Platform's specific storage. What happens here is that Jenkins needs some persistent storage in order to store configuration for the master, so that if the pod serving the master fails, it can recreate it based on the persistant volume.

If we look at the [persistent volume claim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims), we see that it created an Azure Storage Account and a `.vhd` where it deployed the storage. 

![](/img/article-photos/kubernetes-jenkins-azure/pvc.png)

If we now go in the Azure Portal, to the resource group we created for the cluster, we can find this storage account:

![](/img/article-photos/kubernetes-jenkins-azure/storage-account.png)
And if we open the blobs blade we can actually see the volume storage there:

![](/img/article-photos/kubernetes-jenkins-azure/storage.png)

Configuring Jenkins to work with Kubernetes
-------------------------------------------

At this point, if we go to the Kubernetes dashboard, in the Services part we should see Jenkins with a public IP (or external endpoints) configured:

![](/img/article-photos/kubernetes-jenkins-azure/jenkins-endpoints.png)

> In order to see the Kubernetes dashboard you need to execute `kubectl proxy  --port 8080 --address='0.0.0.0'`

If we navigate to the HTTP endpoint of Jenkins (that is port 80), we should see the first-time installation view from Jenkins:

![](/img/article-photos/kubernetes-jenkins-azure/jenkins-1st.png)

In order to login we need to get a password from the machine running the service - in this case a Docker container running inside a Kubernetes pod. To see the pods either go in the Kubernetes dashboard:

![](/img/article-photos/kubernetes-jenkins-azure/pods.png)

Or you can see it from the command line, but first we need to set the CLI context to the newly created namespace:

`kubectl config set-context $(kubectl config current-context) --namespace=kubernetes-plugin`

Now we can see the running pods:

`kubectl get pods`

![](/img/article-photos/kubernetes-jenkins-azure/jenkins-pod.png)

Coming back to our previous task: retrieving the password that Jenkins set up at `/var/jenkins_home/secrets/initialAdminPassword`. We need to execute a command inside this pod to get the password:

`kubectl exec -it jenkins-cqn0z cat /var/jenkins_home/secrets/initialAdminPassword`

![](/img/article-photos/kubernetes-jenkins-azure/kubectl-get-password.png)


> Note that you should replace `jenkins-cqn0z` from the `kubectl exec` with your own pod!

Now paste that string in the Jenkins setup page and you should be good to go.

At this point, you would simply click on Install Suggested Plugins and it might work. It might also not work - `WARNING: No valid crumb was included in request`, as in the photo below: 

![](/img/article-photos/kubernetes-jenkins-azure/crumb.png)

Try a few more times until it works and we will get solve this by enabling proxy compatibility once we have access to the service's settings. 

> As starting point for this I used [this repo from carlossg](https://github.com/carlossg/jenkins-kubernetes-plugin) and [the official documentation on the kubernetes-plugin from Jenkins](https://github.com/jenkinsci/kubernetes-plugin).

> Of course it didn't really work without a lot of trial and error, hence the reason for writing this article.

After clicking `Start using Jenkins`, you are ready to Enable Proxy Compatibility from Configure Jenkins --> Configure Global Security --> Enable Proxy Compatibility - of course, not after a lot of tries and failure because `No valid crumb was included in request`.

Configuring Jenkins to dinamically spawn agents (Docker containers) for builds
-----------------------------------------------------------------------

Since we want to have dynamically spawned agents (or slaves), we will keep 0 executors (from node settings):

![](/img/article-photos/kubernetes-jenkins-azure/executors.png)

Then, we need to install the [Kubernetes Plugin for Jenkins](https://wiki.jenkins-ci.org/display/JENKINS/Kubernetes+Plugin) - Manage Jenkins --> Manage Plugins --> Available --> Search for `kubernetes plugin`.

![](/img/article-photos/kubernetes-jenkins-azure/kubernetes-plugin.png)

Then restart Jenkins after installing the plugin.

Now you need to configure the Kubernetes plugin: Manage Jenkins --> Configure System, and all the way to the bottom --> Add a new cloud.

Add the credentials to your Kubernetes cluster as in the picture below:

![](/img/article-photos/kubernetes-jenkins-azure/kubernetes-credentials.png)

Then add the Kubernetes master FQDN (Fully Qualified Domain Name) and test the connection: 

![](/img/article-photos/kubernetes-jenkins-azure/test-connection.png)

Then add the Jenkins URL (with http!) and the Jenkins tunnel (without http and with the 50000 port!) and set a resonable container cap (how many containers should run at the same time):


![](/img/article-photos/kubernetes-jenkins-azure/jenkins-url-tunnel.png)

> The other settings in the picture I left untouched.

Next we need to configure a container templat based on which Jenkins will spawn slaves to execute builds. This part is rather tricky and pretty undocumented, so it took me quite a lot. Here we go:

We need to Add a Pod Template --> Kubernetes Pod Template. The name of the template should be `jnlp`, otherwise this will not work.

Next we need to add a container template. The name of the container should also be `jnlp`, or it will not work.

The Docker image for the slaves
-------------------------------

[As the documentation states](https://github.com/jenkinsci/kubernetes-plugin), you need to use a [jnlp-slave image from Docker Hub](https://hub.docker.com/r/jenkinsci/jnlp-slave/). If we take a look at the Dockerfile for this image:

```
FROM jenkinsci/slave:alpine
MAINTAINER Nicolas De Loof <nicolas.deloof@gmail.com>

COPY jenkins-slave /usr/local/bin/jenkins-slave

ENTRYPOINT ["jenkins-slave"]
```

This will surely work, but all this is going to do is give you a container based on the openjdk container (so with a Java SDK) and git.

> [Dockerfile for the base image for the jnlp-slave](https://hub.docker.com/r/jenkinsci/slave/~/dockerfile/)


But we might have more and diverse workloads - and since we can configure the slave container only globally, we might just install more frameworks in this container - Node, Ruby, .NET Core - but this is just against what containerization stands for. We want to be able to build any kind of containerized workload with our Jenkins instance.

Here's what we want to do:

    - be able to build any kind of workload on our Jenkins isntance
    - deploy the built images / applications back to Kubernetes

So clearly we need to update our Dockerfile by installing the Docker client and the kubectl CLI.

Let's have a look at how the Dockerfile would look like:

```
FROM jenkinsci/slave:alpine

USER root
RUN apk add --no-cache \
ca-certificates \
curl \
openssl

ENV DOCKER_BUCKET get.docker.com
ENV DOCKER_VERSION 17.04.0-ce
ENV DOCKER_SHA256 c52cff62c4368a978b52e3d03819054d87bcd00d15514934ce2e0e09b99dd100

RUN set -x \
&& curl -fSL "https://${DOCKER_BUCKET}/builds/Linux/x86_64/docker-${DOCKER_VERSION}.tgz" -o docker.tgz \
&& echo "${DOCKER_SHA256} *docker.tgz" | sha256sum -c - \
&& tar -xzvf docker.tgz \
&& mv docker/* /usr/local/bin/ \
&& rmdir docker \
&& rm docker.tgz \
&& docker -v

RUN curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl

RUN chmod +x ./kubectl
RUN mv ./kubectl /usr/local/bin/kubectl

COPY docker-entrypoint.sh /usr/local/bin/

COPY jenkins-slave /usr/local/bin/jenkins-slave

RUN chmod +x /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/jenkins-slave

ENTRYPOINT docker-entrypoint.sh; jenkins-slave

```

It starts from the same base image as the Jenkins `jnlp-slave`, but it also adds Docker and kubectl. I built and pushed this image to [radumatei/jnlp-slave-docker:kubectl](https://hub.docker.com/r/radumatei/jenkins-slave-docker/)

So we can use this as the base image for the slave containers.


![](/img/article-photos/kubernetes-jenkins-azure/settings.png)

Since we want to mount the `/var/run/docker.sock` from the host to the container so the containers can use the Docker engine installed on the node.

> The solution is [based on this article from Jérôme Petazzoni](http://jpetazzo.github.io/2015/09/03/do-not-use-docker-in-docker-for-ci/)

Remember that in our Dockerfile we also installed kubectl. Since we need to actually modify deployments in the cluster using kubectl from inside the contaier, we need to authenticate the container in some way. Since the node that runs the slave pod that is doing the build is actually part of the cluster, this means at `/root/.kube` there should be the information about the cluster which would allow us to actually make a deployment against the cluster. So we also mount `/root/.kube` from the host to the container.

This should be pretty much all setup involved. It might not sound much, but it is rather undocumented or not up to date.

Before we setup the pipeline, let's create a public service on Kubernetes that we will update after a build.

![](/img/article-photos/kubernetes-jenkins-azure/public-service.png)

While configuring the pipeline, you also need the Docker Hub credentials:

![](/img/article-photos/kubernetes-jenkins-azure/docker-hub-credentials.png)

So setup your own GitHub project (that has a Dockerfile at the root of the project) as a Jenkins pipeline with the following configuration:

STEP 1:
```
docker build -t ${DOCKER_HUB_USER}/dotnet-core-kubernetes:${BUILD_NUMBER} .
docker login -u ${DOCKER_HUB_USER} -p ${DOCKER_HUB_PASSWORD}
docker push ${DOCKER_HUB_USER}/dotnet-core-kubernetes:${BUILD_NUMBER}
```

STEP 2:
```
kubectl set image deployment/dotnet-core-kubernetes dotnet-core-kubernetes=${DOCKER_HUB_USER}/dotnet-core-kubernetes:${BUILD_NUMBER}
```

Now if you configured the webhook correctly in GitHub, with every commit on the branches you specified should trigger a build for Jenkins:

![](/img/article-photos/kubernetes-jenkins-azure/build.png)

Then, the kubectl command will actually update your application on the cluster.

What is happening behind the scenes?
-------------------------------------

With every initiated build, the Jenkins master will start a new pod in the Kubernetes cluster based on the Docker image you specified when configuring it (in this case [radumatei/jnlp-slave-docker:kubectl](https://hub.docker.com/r/radumatei/jenkins-slave-docker/)):

![](/img/article-photos/kubernetes-jenkins-azure/creating.png)

It will pull that image and once the application starts, it will connect to port 50000 on the Jenkins service to register as available to serve builds. 

It will start the build steps on this container and you can see this in the logs from the build:

![](/img/article-photos/kubernetes-jenkins-azure/build1.png)

![](/img/article-photos/kubernetes-jenkins-azure/build2.png)

After the build finishes (regardless of success or failure), the master will terminate the slave and all resources will be released:

![](/img/article-photos/kubernetes-jenkins-azure/spike.png)

Conclusion
----------

In this article I tried to clearly show how to get started with a Jenkins master as a Kubernetes service that dynamically creates slaves to execute your build and then terminates them.

The great advantage of this is that you only start containers once they have a task (in this case a build) to execute.

We managed to build a complete workflow with Kubernetes and Jenkins that will automatically build and integrate your updates to your application.

Next steps
-----------

As a next step I will investigate [deploying Jenkins using Helm](https://github.com/kubernetes/helm), which I assume should be a much simpler task.

Feedback
---------

If you stumbled upon this article, please take a minute to provide feedback to it - did it help, do you know a better or simpler way of achieving this?

Your feedback is highly appreciated!

Thanks for reading! :)
-----------------------