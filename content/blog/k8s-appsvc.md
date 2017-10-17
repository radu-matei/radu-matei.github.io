+++
author = "Radu Matei"
categories = ["kubernetes", "azure"]
date = "2017-10-17"
description = "Consuming a private API built with Kubernetes from Azure App Service"
linktitle = ""
title = "Best of Both worlds: Azure App Service and Kubernetes"
type = "post"

+++

Table of Contents
-----------------

- [Introduction](#introduction)
- [Prerequisites](#prerequisites)
- [Why not just expose services publicly?](#why-not-just-expose-services-publicly)
- [Deploy Kubernetes services with a private IP](#deploy-kubernetes-services-with-a-private-ip)
- [The networking settings](#the-networking-settings)
- [Testing the integration](#testing-the-integration)
- [Conclusion](#conclusion)
- [Next Steps](#next-steps)
- [Feedback](#feedback)


Introduction
------------

In this article we will explore how to integrate Azure App Service and Kubernetes within the same Azure Virtual Network and consume Kubernetes services from an Azure App Service app without exposing them on the public Internet.

There will be lots of situations when we want to use both the simplicity and features of a PaaS service (such as autoscaling, easy SSL, or any other cool feature) for a component and the flexibility of Kubernetes for others - in this article we will see how to achieve this without exposing services on the Internet.

We will start from a just-deployed Kubernetes cluster, will see how to expose services internally in an Azure VNet using an Azure Internal Load Balancer, then we will see how to connect an Azure App Service to that VNet, consuming services on the cluster from our App Service without exposing them on the public Internet.

> Note that in order to deploy a Kubernetes cluster on Azure you can either [use `acs-engine` (a tool that deploys custom clusters on Azure) - here's how to deploy Kubernetes 1.8 on Azure using `acs-engine`](https://radu-matei.com/blog/k8s18-azure/) or [use the `az` command line - here's the official documentation.](https://docs.microsoft.com/en-us/azure/container-service/kubernetes/container-service-kubernetes-walkthrough)

Prerequisites
-------------

This tutorial assumes you have a valid Azure subscription that you can use to deploy resorces. If you don't have an Azure subscription you can [create a free account and get $200 for 12 months](https://azure.microsoft.com/en-us/free/?v=17.39a).

This tutorial uses a 4-node Kubernetes cluster (1 master + 3 agents) deployed on Azure. The machines are 4 D2_V2 VMs with Linux that will cost approximately $13 - $14 / day, but you can change the type of the VM to be D1_V2, and the cost will go down to $6 / day.

Besides the Kubernetes cluster, this article will also use an Azure App Service, with at least the Standard pricing tier (in order to support the VNet gateway feature, but more on this later), which in development starts at around  $1.5 / day.

![](/img/article-photos/k8s-appsvc/pricing.PNG)

> Note that the pricing will vary slightly based on the location where you deploy the VMs.

> Cost estimation created using the [Azure Pricing Calculator](https://azure.microsoft.com/en-us/pricing/calculator/)

This tutorial will also use an Azure VNet gateway that based on the throughput needed can go from less than $1/day (for 100 Mbps) to around $30/day (for 1.25 Gpbs).

> Here you can [find out more about the Azure VPN Gateway](https://azure.microsoft.com/en-us/pricing/details/vpn-gateway/)

Why not just expose services publicly?
--------------------------------------

The alternative to this entire article is simply exposing public services from Kubernetes with a public IP address and just use that public IP address from your App Service application.

Let's explore some of the reasons you might not want to do this:

- security risks and implications - it means that your services are exposed publicly and you need to deal with the risks associated
- latency - you will go over the Internet to access your service, meaning you will get higher latency
- networking cost - public IPs, outbound traffic (data going out of a datacenter) cost money

> Networking pricing is a complex topic in any cloud provider and I am by no means expert in Azure Networking - you can read more about Azure Networking [pricing for virtual networks](https://azure.microsoft.com/en-us/pricing/details/virtual-network/), for [VPN gateways](https://azure.microsoft.com/en-us/pricing/details/vpn-gateway/) and [bandwidth](https://azure.microsoft.com/en-us/pricing/details/bandwidth/).


Deploy Kubernetes services with a private IP
--------------------------------------------

When you deploy Kubernetes in Azure, all resources (network interfaces of VMs, load balancers) are deployed in a virtual network, and each VM gets a private IP inside that VNet.


![](/img/article-photos/k8s-appsvc/k8s-vnet.PNG)

> In the picture above you can see the internal IP of each node and subnet they belong to.

Now when you deploy an internal service on the cluster (that is without exposing it through a load balancer or through a node port), Kubernetes will assign your service a *cluster IP*. This IP (together with the hostname associated with it: `<service>.<namespace>`) is only accessible to other services in the cluster - this means that another service in the same VNet, for example a VM that is not part of the cluster will *not be able to access that service.*

However, in order to access Kubernetes services from within that virtual network, you need to specify an internal load balancer using an annotation when you create the service.
That being said, let's see how a Kubernetes service that is internally exposed in the virtual network looks like:

{{< gist radu-matei 4802dc126af06829b1904c49e4b97d57 >}}

The only notable thing is the annotation part of the service: `service.beta.kubernetes.io/azure-load-balancer-internal: "true"` - this tells Kubernetes to ask Azure for an internal load balancer. So after we deploy this, we will see a private IP of this service, as well as a newly created internal load balancer in Azure:


![](/img/article-photos/k8s-appsvc/internal-lb.PNG)

Now if we take a look at the Kubernetes services:


![](/img/article-photos/k8s-appsvc/kubectl-service.PNG)

And the IP address of the internal load balancer:


![](/img/article-photos/k8s-appsvc/private-ip.PNG)



The networking settings
------------------------

So we now have a Kubernetes service accessible from within our virtual network. We now need to integrate an App Service instance in that virtual network to consume the API we deployed.

By default, when deploying an App Service application, it is not connected to a virtual network. Now it's worth mentioning that App Service comes in two forms:

- The multi-tenant systems that support the full range of pricing plans - this is the most common and most used version
- The [App Service Environment (ASE)](https://docs.microsoft.com/en-us/azure/app-service/environment/intro) premium feature, which deploys into your VNet.

In this article we will focus on integrating a regular App Service with an Azure Virtual Network, and it is also worth mentioning some features, restrictions and limitations:

The VNet Integration feature:

 - requires a Standard, Premium, or Isolated pricing plan
 - works with Classic or Resource Manager VNet
 - supports TCP and UDP
 - works with Web, Mobile, and API apps
 - enables an app to connect to only 1 VNet at a time
 - enables up to five VNets to be integrated with in an App Service Plan
 - allows the same VNet to be used by multiple apps in an App Service Plan
 - supports a 99.9% SLA due to the SLA on the VNet Gateway

There are some things that VNet Integration does not support including:

 - mounting a drive
 - AD integration
 - NetBios
 - private site access

> The previous information and more details can be found on [the official App Service Documentation here](https://docs.microsoft.com/en-us/azure/app-service/web-sites-integrate-with-vnet).

Basically, there will be a point-to-site VPN to the VNet where Kuberentes is deployed, the point being our App Service instance.
Now in order to create this, we first need to [enable the VNet integration, as described in this article](https://docs.microsoft.com/en-us/azure/app-service/web-sites-integrate-with-vnet#enabling-vnet-integration).

If you go to the Networking tab of your App Service and try to enable the VNet integration for your Kubernetes VNet, you will see the following message:

![](/img/article-photos/k8s-appsvc/no-gateway.PNG)

This means there is no [VPN Gateway](https://docs.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpngateways) configured in that private network.


> A virtual network gateway is composed of two or more virtual machines that are deployed to a specific subnet called the GatewaySubnet. The VMs that are located in the GatewaySubnet are created when you create the virtual network gateway. Virtual network gateway VMs are configured to contain routing tables and gateway services specific to the gateway. You can't directly configure the VMs that are part of the virtual network gateway and you should never deploy additional resources to the GatewaySubnet.

> [More on VPN Gateways here](https://docs.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-about-vpngateways)


So you need to create a VPN Gateway on that virtual network (keeping in mind to configure it based on your needs), and also keeping in mind that it could take up to half an hour to configure it:

![](/img/article-photos/k8s-appsvc/create-gateway.PNG)


30 minutes later we have a Virtual Network Gateway deployed in the same VNet as the Kubernetes cluster. Now if we go back and try to setup the App Service, we see that we haven't configured point-to-site VPN for this network:

![](/img/article-photos/k8s-appsvc/no-pts.PNG)

From the gateway menu in the portal configure point-to-site (with your own value for the client address pool). Note that you don't need to setup certificates, these will be created automatically when you connect the App Service with the gateway.

![](/img/article-photos/k8s-appsvc/pts.PNG)

After you configure point-to-site in the network, you can go back to the App Service and configure the VNet access:

![](/img/article-photos/k8s-appsvc/setup.PNG)

Testing the integration
-----------------------

Now to the moment of truth: I created a very simple .NET Core app (it can be Node, PHP, Java) that makes requests to a `PrivateAddress` that you can configure in the App Settings in Azure Portal. You can [find the app on GitHub](https://github.com/radu-matei/app-svc-vnet), but all it does is make an HTTP request and return the response.

Now if you fork the repo above and do a [GitHub deployment directly to Azure App Service](https://blogs.msdn.microsoft.com/benjaminperkins/2017/05/10/deploy-github-source-code-repositories-to-an-azure-app-service/), then create an App Setting for `PrivateAddress` with the private IP of your service in the virtual network:

![](/img/article-photos/k8s-appsvc/private-address.PNG)

Then, when you access `/api/privatestuff` on your public web app, you can see that it actually makes requests inside your virtual network:

![](/img/article-photos/k8s-appsvc/access.PNG)

Here you can see which pod actually responded to the request, and if you refresh, you can see the requests are load balanced.

![](/img/article-photos/k8s-appsvc/pods.PNG)


Current known limitations
-------------------------

Right now you cannot use this article with a Web App on Containers or App Service on Linux, as the VNet integration does not currently support them. 

Also, you currently cannot have [DNS name for the internal IP of the load balancer. This is known feature request on Azure Feedback, and according to the Azure Networking team, it represents a key item on the roadmap](https://feedback.azure.com/forums/217313-networking/suggestions/16825357-add-dns-name-label-to-private-ips)

Conclusion
----------

Now you have successfully deployed an application on App Service that uses private APIs from within a non-Internet routable network. You get the best of both worlds: the ease of deployment, autoscaling, SSL and other fun features of App Service, with the flexibility of Kubernetes, all in the same application.


Next Steps
-----------

A next step would be creating deployment pipelines for both App Service and the Kubenetes apps - [here is an example of a pipeline using Jenkins](https://github.com/azure-devops/movie-db-java-on-azure) for a web app on App Service with the backend in Kubernetes.

Feedback
--------

If you have a better aproach at any of the concepts presented in this article, or have any questions, please use the comments below.

As always, thanks for reading, and any feedback is highly appreciated :)