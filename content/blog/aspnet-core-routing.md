+++
author = "Radu Matei"
categories = ["aspnet-core"]
date = "2016-07-20"
description = "Getting started with ASP .NET Core"
featuredalt = ""
featuredpath = "date"
linktitle = ""
title = "ASP .NET Core Routing"
type = "post"

+++

**Table of Contents** 

- [Routing](#)
	- [Introduction](#introduction)
	- [Installing the Routing package](#installing-the-routing-package)
	- [Adding the Routing Service in Startup](#adding-the-routing-service-in-startup)
	- [Adding and handling custom routes](#adding-and-handling-custom-routes)
	- [The full Startup class](#the-full-startup-class)
	- [Conclusion](#conclusion)

Routing
=======

Introduction
---------------

In the previous example we built a very simple web application that responded with `Hello, Universe` and the current server time for every request. 

> When the application is running and you navigate to http://localhost5000, regardless of the path followed (http://localhost:5000/something/something-else/etc), the response is the same.


However, any real-world application is going to need a more complex way of handling requests, so in this article we will see how to create route handlers for specific routes and how to extract parameters from the request URI.


> The best place to start learning about Routing is the [Official ASP .NET Core Documentation](https://docs.asp.net/en/latest/fundamentals/routing.html).

> Since we haven't started talking about MVC, the routing discussed here will not include any MVC-specific routing on controllers, actions or parameters, but routing done using [Routing Middleware](https://docs.asp.net/en/latest/fundamentals/routing.html#using-routing-middleware).

Installing the `Routing` package
-----------------------------------------

First of all, we need to add the `Microsoft.AspNetCore.Routing` dependency from NuGet. 

```
      "dependencies": {
        "Microsoft.NETCore.App": {
          "type": "platform",
          "version": "1.0.0"
        },
        "Microsoft.AspNetCore.Server.Kestrel": "1.0.0",
        "Microsoft.AspNetCore.Routing": "1.0.0"
      }
```

This is how the `dependencies` node of `project.json` should look like.

> The difference form the [previous example](https://github.com/radu-matei/blog-content/blob/master/articles/aspnet-core-startup.md#building-the-hello-world-web-application-with-startup) is just the addition of the `Routing` package.

> From now on, when adding a new dependency from NuGet the full `project.json` will not be shown anymore, but only the new package added.

> At the time of writing this article, the latest version for all ASP .NET Core libraries is `1.0.0`. As newer versions are released, check the release notes to see if there are any breaking changes when updating packages.


Adding the `Routing` Service in `Startup`
-----------------------------------------------------

When we discussed [the anatomy of the `Startup` class](https://github.com/radu-matei/blog-content/blob/master/articles/aspnet-core-startup.md#the-anatomy-of-the-startup-class), besides the `Configure` method we have used before, there was also a method called `ConfigureServices` used for configuring services that our application needs.

Since we are going to use Routing, we should add it as a service in `Startup`.

```
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddRouting();
    }
```

Adding and handling custom routes
-------------------------------------------

First of all, in the `Configure` method from `Startup` we need to instantiate a new instance of the `RouteBuilder` class that will allow us to build custom routes and handle them.

```
var routeBuilder = new RouteBuilder(app);
```

We will then use this instance to map requests to to specific paths with our request handlers, allowing us to handle`GET` and `POST` requests from clients.

The way to map a `GET` request is to use the `MapGet` method from `RouteBuilder`. Mapping the application root - http://localhost:5000 is done through:

```
routeBuilder.MapGet("", context => context.Response.WriteAsync("Hello from root!"));
```

Mapping specific paths for `GET` - for example http://localhost:5000/hello is done in the following way.

```
routeBuilder.MapGet("hello", context => context.Response.WriteAsync("Hello from /hello"));
```

We can create paths that contain multiple elements and we can extract the parameters entered when making the request. For example, when requesting on `hello/{name}`, we can extract the parameter `{name}` and use it when constructing the response:

```
routeBuilder.MapGet("hello/{name}", context => context.Response
                                                      .WriteAsync($"Hello, {context.GetRouteValue("name")}"));
```

We can also add constrains on the parameters. For example, let's create a respond for requests coming to the path `/square/{number}`, where `{number}` is an `int` and responds with the square of the number.

```
routeBuilder.MapGet("square/{number:int}", context =>
        {
            int number = Convert.ToInt32(context.GetRouteValue("number"));
            return context.Response.WriteAsync($"The square of {number} is {number * number}");
        });
```

> For a full list of parameter constraints, see this table from [the Official ASP .NET Core Documentation](https://docs.asp.net/en/latest/fundamentals/routing.html#id7).


In order to test wether the routing works properly, open a browser and navigate to your custom route and check if the output is the desired one.

> You can also place some breakpoint inside the custom route handlers and iterate through the handlers step-by-step, watching how the response is formed.

```
http://localhost:5000
http://localhost:5000/hello
http://localhost:5000/hello/John
http://localhost:5000/square/3
```

So far we only created routing mapped for the `GET` method, so we can test the output from a browser tab.
Now we will add routing for a `POST` method (so we will not be able to test it by navigating to the URL in the browser).

```
routeBuilder.MapPost("post", context => context.Response.WriteAsync("Posting!"));
```

In order to test this route, we need to use a tool that sends `HTTP` requests to our application. We will use [PostMan for Google Chrome](https://chrome.google.com/webstore/detail/postman/fhbjgbiflinjbdggehcddcbncdddomop).

![](/img/article-photos/aspnet-core-routing/routing-postman.JPG)


> If we try and change the method type in PostMan from `POST` to `GET`, we notice how the request fails.

The full `Startup` class
-------------------------------
```
using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        
        var routeBuilder = new RouteBuilder(app);
        
        routeBuilder.MapGet("", context => context.Response.WriteAsync("Hello from root!"));
        routeBuilder.MapGet("hello", context => context.Response.WriteAsync("Hello from /hello"));
        routeBuilder.MapGet("hello/{name}", context => context.Response
                                                              .WriteAsync($"Hello, {context.GetRouteValue("name")}"));

        routeBuilder.MapGet("square/{number:int}", context =>
        {
            int number = Convert.ToInt32(context.GetRouteValue("number"));
            return context.Response.WriteAsync($"The square of {number} is {number * number}");
        });

        routeBuilder.MapPost("post", context => context.Response.WriteAsync("Posting!"));

        app.UseRouter(routeBuilder.Build());

    }

    public void ConfigureServices(IServiceCollection services)
    {
        services.AddRouting();
    }
}
```


Conclusion
--------------

We created a basic web application and we defined and handled custom routes. We also saw how to manage `GET` and `POST` requests.
