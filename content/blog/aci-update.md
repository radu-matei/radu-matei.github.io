+++
author = "Radu Matei"
categories = ["azure", "docker", "golang"]
date = "2017-12-14"
description = "Automatically update the image of your Azure Container Instance and keep the public IP address of the container group"
linktitle = ""
title = "Update Azure Container Instances with Docker Hub webhooks"
type = "post"
summary = "In this article we will see how to update Azure Container Instances based on webhooks from Docker Hub"

+++

Table of Contents
-----------------

- [Introduction](#introduction)
- [Webhooks from Docker Hub](#webhooks-from-docker-hub)
- [Using the Azure Go SDK to update container groups](#using-the-azure-go-sdk-to-update-container-groups)
- [See it in action](#see-it-in-action)
- [Final Thoughts](#final-thoughts)
- [Feedback](#feedback)

Introduction
------------

Back in July, [Microsoft announced Azure Container Instances](https://azure.microsoft.com/en-us/blog/announcing-azure-container-instances/), *a new Azure service delivering containers with great simplicity and speed and without any Virtual Machine infrastructure to manage. ACIs are the fastest and easiest way to run a container in the cloud.*

Essentially, this allowed you to run single or multi-container groups (scheduled on the same host machine, within the same local network, storage and lifetime) with fast startup times, hypervisor-level security, public IP address connectivity and billing by the second. 

> [Here's the quickstart from the Azure Documentation where you can get started with ACI from the portal or the CLI](https://docs.microsoft.com/en-us/azure/container-instances/)

> [Here's an awesome Medium article by Liz Rice where you can learn how to deploy multi-container groups on ACI](https://medium.com/@lizrice/azure-container-instances-with-multiple-containers-512c022c04ec)

One thing that Azure Container Instances didn't have when first launched was the ability to update the image of a container while keeping the public IP address of the container group - essentially, when you had a new version / tag of your image, you had to redeploy the everything and you would have gotten a different public IP address.

> Here we are only talking about using ACI without any orchestrator - you can use ACI with Kubernetes through the [aci-connector-k8s](https://github.com/Azure/aci-connector-k8s) project, or through the new [virtual-kubelet](https://github.com/virtual-kubelet/virtual-kubelet), which creates a virtual node in your Kubernetes cluster that schedules pods on top of Azure Container Instances.

In this article we will not use any of the two projects mentioned, but build a simple app that listens for webhooks from Docker Hub (or any other container registry) and uses the [Azure Go SDK](https://github.com/Azure/azure-sdk-for-go) to update the container.

Please note that while you will not be able to do this from the portal, it can be done through the Azure REST API or various language SDKs.


Webhooks from Docker Hub
-----------------------
As I was saying earlier, we will accept incoming webhooks from Docker Hub and update the Azure containers accordingly. First let's see how a Docker Hub webhook looks like:

{{< gist radu-matei 92aad3a204d954f4316875528fbe6a23 >}}


> [Taken from the Docker Hub documentation](https://docs.docker.com/docker-hub/webhooks/)

Essentially, in the webhook data we have all necessary information to update the container with the newly pushed image.

Now taking that JSON and using it with [this little cool utility that generates Go structs from JSON](https://mholt.github.io/json-to-go/), we get the Go struct that contains the webhook data:

{{< gist radu-matei bf9c1eaf61cd7bc548a2fc80e6c40421 >}}


> You can [find the project on GitHub](https://github.com/radu-matei/aci-hooks/blob/master/main.go#L17)

From this point, we'll create a simple web server that listens for webhook requests and will update the container using the Go SDK.


Using the Azure Go SDK to update container groups
-------------------------------------------------

In order to use the Azure Go SDK you need some credentials - first of all, [go through the documentation showing you how to create a service principal](https://docs.microsoft.com/en-us/azure/azure-resource-manager/resource-group-create-service-principal-portal).

You will need the following:

```text
AZURE_TENANT_ID: contains your Azure Active Directory tenant ID or domain
AZURE_SUBSCRIPTION_ID: contains your Azure Subscription ID
AZURE_CLIENT_ID: contains your Azure Active Directory Application Client ID
AZURE_CLIENT_SECRET: contains your Azure Active Directory Application Secret
```

The credentials above allow us to programmatically access Azure resources through the REST API or through an SDK - in our case, we'll use the Go SDK - they are used as environment variables in the program, together with the resource group name and container group name:

```text
RESOURCE_GROUP_NAME: the name of the resource group where the container group is deployed
CONTAINER_GROUP_NAME: name of the container group
```

> If you use `vndr` as dependency manager for Go, check the `vndr.conf` file for this project - otherwise, add `github.com/Azure/azure-sdk-for-go` to your project, or [simply clone this repo which contains the entire application](https://github.com/radu-matei/aci-hooks).

First, we need an instance of `ContainerGroupsClient`:

{{< gist radu-matei 2e3e0a95640c65b33940f7a9c5ff73e5 >}}


Here we simply use the SDK to authenticate using the credentials we got earlier and retrieve a new instance of `ContainerGroupsClient`.

> This is the standard procedure to authenticate the Go SDK to your Azure subscription and you can use it to create [other types of clients](https://github.com/Azure/azure-sdk-for-go/tree/master/arm).

Then, we iterate through the desired container group, searching for the container with the same image as the one in the webhook, then update it:

{{< gist radu-matei e886f85fcb4dd316f3016aa9a60210a2 >}}


Because you can have multiple containers in your group, we need to iterate through all of them to find the one with the image from the webhook. When we find it, we set the image to be the newly received from the webhook and call `containerGroupsClient.CreateOrUpdate()`.

All you have to do now is read the body of the HTTP request containing the webhook and execute the function:

{{< gist radu-matei 17ab85c46b8e2ca4eac1b86ce4e31af5 >}}

See it in action
----------------

First of all, we need to deploy an Azure Container Instance based on an image (**we own**) from Docker Hub:

![](/img/article-photos/aci-update/select-aci.jpg)

We give it a name, an image and a resource group:

![](/img/article-photos/aci-update/basics.png)

Now we can setup the OS type, resources (CPU and memory) and the public IP address:

![](/img/article-photos/aci-update/config.png)

After a few moments, you should have a running container with a public IP address:

![](/img/article-photos/aci-update/deployed.png)

This is the container running:

![](/img/article-photos/aci-update/v1.jpg)



Now we need to:

- start the web server that accepts webhooks from Docker Hub
- setup the webhook from Docker Hub to push to our web server
- update the Docker image and have our container updated

> Don't forget to add the environment variables for the Azure credentials and the resource group and container group name!

> I will use [ngrok to expose my local webserver](https://ngrok.com/download) to accept webhooks from Docker Hub - in another article we will see another way to run our function that updates the container group.


[The webserver from the repo](https://github.com/radu-matei/aci-hooks) listens on port 8080 by default (you can change it) - so I will start a tunnel to my local port 8080 through: `ngrok http 8080`:

![](/img/article-photos/aci-update/ngrok.png)

Then, I'll setup the Docker Hub webhook to push to the public endpoint exposed by `ngrok`:

![](/img/article-photos/aci-update/hub.jpg)


Now let's see what happens when we `docker push radumatei/aci-hooks:v2` to Docker Hub:


Our webserver gets called and starts executing the container update method:
![](/img/article-photos/aci-update/aci-hooks.png)



The container in the portal gets automatically updated:
![](/img/article-photos/aci-update/portal-update.png)


Our container is actually updated to the new version (notice the public IP address is unchanged):
![](/img/article-photos/aci-update/v2.jpg)

> [Credit for the awesome Gophers photo used in the sample goes to Ashley McNamara!](https://github.com/ashleymcnamara/gophers)

> Of course, we can deploy this application to Azure Container Instance - Inception!


Final Thoughts
--------------

This app was quickly put together to show that using the SDK you can update Azure Container Instances using webhooks from Docker Hub - of course, it can be extended to take webhooks from your favourite container registry, and even keep track of multiple ACI instances to update - this is outside the scope of the article.

Hopefully in a future article we will see how to stop using `ngrok` and a full web server and move towards serverless - Azure Functions.

> Please note that while the container gets updated, your app will be down for a couple of seconds!

Feedback
--------

Thanks for reading! If you want to extend the functionality of this little tool, [you are welcome to contribute on GitHub](https://github.com/radu-matei/aci-hooks) with issues and pull requests.

I would love to hear your thoughts - feel free to comment below, [or send me an email](/contact)