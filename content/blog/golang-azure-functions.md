+++
author = "Radu Matei"
categories = ["azure", "golang", "grpc"]
date = "2017-12-14"
description = "Journey to adding native Go in Azure Functions"
linktitle = ""
title = "Adding native Go in Azure Functions"
type = "post"
summary = "Journey to adding native Go in Azure Functions"

+++

Table of Contents
-----------------

- [Introduction](#introduction)

Introduction
-------------

Fall 2017 came with the [announcement of Azure Functions on Linux and Mac](https://azure.microsoft.com/en-us/blog/serverless-for-all-developers-bringing-azure-functions-to-linux-mac-planet-scale-nosql-real-time-analytics-and-productivity-apps/) and the ability to [add the Azure Functions runtime in a container](https://blogs.msdn.microsoft.com/appserviceteam/2017/11/15/functions-on-linux-preview/).

Besides that, [the runtime has been split between a host (which manages function events) and language worker processes (which runs user functions for a given language). These two pieces communicate using gRPC as a messaging layer.](https://github.com/Azure/azure-webjobs-sdk-script/wiki/Language-Extensibility) - essentially, this allows you to add support for Azure Functions to any language you want - you only have to create a gRPC implementation in your language of choice and accept incoming requests from the runtime host.

This is how the [Java](https://github.com/Azure/azure-functions-java-worker) and [nodeJS](https://github.com/Azure/azure-functions-nodejs-worker) workers in Azure Functions preview are implemented, and the moment I heard about this, I wanted to create the Golang implementation.

**Now it is important to understand that this is not an officially supported Microsoft product!**
That being said, let's have some fun with Go and Azure Functions! 

At this point in the implementation

Now the great thing about Azure Functions is, besides the ability to 

