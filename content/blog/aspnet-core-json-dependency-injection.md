+++
author = "Radu Matei"
categories = ["aspnet-core", "dependency-injection"]
date = "2016-08-18"
description = ""
linktitle = ""
title = "Inject ASP.NET Core Dependencies from JSON files"
type = "post"

+++

Table of Content
----------------

- [Introduction](#introduction)
- [The need for registering services through a JSON file](#the-need-for-registering-services-through-a-json-file)
- [Adding the required packages](#adding-the-required-packages)
- [Creating a dummy service](#creating-a-dummy-service)
- [How to inject an `ITest` service](#how-to-inject-an-itest-service)
- [The JSON file](#the-json-file)
- [The `Service` class](#the-service-class)
- [Adding the services](#adding-the-services)
- [Testing the application](#testing-the-application)
- [The `Startup` class](#the-startup-class)
- [Conclusion](#conclusion)


Introduction
------------

"Back in the days" of ASP.NET 4.x, each of the framework components (MVC, WebAPI, OWIN, SignalR) had its own dependency resolver and its own way of integrating with the framework.

For example, if you had an application that used MVC/WebAPI, OWIN and SignalR and you wanted to use [Autofac](http://autofac.readthedocs.io/en/latest/index.html), you would have needed individual integrations, with different method names (see [`RegisterControllers`](http://autofac.readthedocs.io/en/latest/integration/mvc.html#register-controllers) for MVC and [`RegisterApiControllers`](http://autofac.readthedocs.io/en/latest/integration/webapi.html#register-controllers) for WebAPI), different NuGet packages (see [the package for WebAPI](https://www.nuget.org/packages/Autofac.WebApi2/) and [the package for MVC](https://www.nuget.org/packages/Autofac.Mvc5/)) and different dependency resolvers and you even needed to take care at the order in which you replaced the dependency resolvers for these components.

ASP.NET Core brings a consistent dependency injection mechanism with a unified meaning for lifetime or service registration,that is designed to server the needs of the framework "and most consumer applications built on it" ([as the documentation states](https://docs.asp.net/en/latest/fundamentals/dependency-injection.html#replacing-the-default-services-container)).

Of course, you can replace the default DI engine that comes with the framework and use [Autofac](http://autofac.readthedocs.io/en/latest/integration/aspnetcore.html), [Dryloc](https://www.nuget.org/packages/DryIoc.Microsoft.DependencyInjection), [Grace](https://www.nuget.org/packages/Grace.DependencyInjection.Extensions), [LightInject](https://github.com/seesharper/LightInject.Microsoft.DependencyInjection) or [StructureMap](https://github.com/structuremap/StructureMap.Microsoft.DependencyInjection) and in a future article, we will probably explore a couple of them.

> In this article, we will see a way of defining the service types and the implementation types we want to use based on a JSON file and switch between implementations without changing the code. 

> This is a feature in Autofac for ASP.NET and you can [find it documented here](http://docs.autofac.org/en/latest/configuration/xml.html), but we will implement a very basic way of adding services using only the built-in mechanism.

> Also, it will not use the [JSON configuration provider](https://radu-matei.github.io/blog/aspnet-core-configuration-greeting/).

The need for registering services through a JSON file
------------------------------------------------------
A very simple reason to think about using a JSON file when registering DI services is because you might not know (or cannot choose) the concrete implementation at compile-time.

Another reason could be for switching implementations for testing purposes.

> You can also [work with multiple environments](https://docs.asp.net/en/latest/fundamentals/environments.html) and have `Startup{EnvironmentName}` class for each environment - dev, testing, production and set the environment variable before running the application.

But for this article, I thought it would be cool to inject the required dependencies based on a JSON file without using any DI engine other than the built-in one from ASP.NET Core.

Adding the required packages
----------------------------

Since this is going to be a web app, we need the Kestrel web server package (Microsoft.AspNetCore.Server.Kestrel). As I said earlier, we are not going to use the JSON Configuration provider (at this point), so we will only need a library to deserialize (part of) JSON, and we will use Newtonsoft.Json.

Creating a dummy service
------------------------

We are going to need a very simple service to inject in our application: 


```
public interface ITest
{
    string DoSomething(string parameter);
}
```
And an even simpler implementation: 
```
public class Test : ITest
{
    public string DoSomething(string parameter)
    {
        return $"Message from Test with { parameter }";
    }
}
```

How to inject an `ITest` service
---------------------------------

In order to inject a service of type `ITest`, you need to add a function in `Startup` called `ConfigureServices` that has a parameter of type `ISerciceCollection` and add the service in this collection.

```
public void ConfigureServices(IServiceCollection services)
{
    services.Add(new ServiceDescriptor(serviceType: typeof(ITest), 
                                       implementationType: typeof(Test), 
                                       lifetime: ServiceLifetime.Transient));
}
```

Now, every time a component will request an instance of `ITest`, the framework will provide *another* instance of `Test`, since the lifetime is passed as *Transient*.

> [Transient objects are always different; a new instance is provided to every controller and every service.](https://docs.asp.net/en/latest/fundamentals/dependency-injection.html)

The JSON File
-------------

Since we will use a JSON file, it might as well be the one we use for other configurations (or a completely different one). Regardless of what you choose, you can extract only the relevant part of the JSON file using a section name.
```
{
    "services": [
        {
            "serviceType": "ITest",
            "implementationType": "Test",
            "lifetime": "Transient"
        }
    ],

    "otherConfigurations": {
        "someKey": "someValue",
        "otherKey": "otherValue"
    }
}
```

In this case, the JSON section we are interested in is `services`. At this key, we have an array of JSON objects with 3 properties: `serviceType`, `implementationType` and `lifetime`, which correspond to the parameters passed to the `ServiceDescriptor` when adding the service.

The `Service` class
-------------------
These 3 properties are mapped into a class called `Service`. For simplicity, the `ServiceType` and `ImplementationType` propeties are of type `string`, but you can always implement a `JsonConverter` that maps them to the type `Type` (There is no immediate conversion from `string` to `Type`).

Since `Newtonsoft` has implemented the conversion from `string` to `enum`, we used it here to convert to `ServiceLifetime` enum from `Microsoft.Extensions.DependencyInjection`.

```
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

public class Service
{
    public string ServiceType { get; set; }

    public string ImplementationType { get;set; }

    [JsonConverter(typeof(StringEnumConverter))]
    public ServiceLifetime Lifetime { get; set; }
}
```

Adding the services
-------------------

Next, in the `Startup` class we will simply deserialize the JSON section into a `List<Service>`, iterate through it and add the services:

```
private void ConfigureJsonServices(IServiceCollection services)
{
    var jsonServices = JObject.Parse(File.ReadAllText("appSettings.json"))["services"];
    var requiredServices = JsonConvert.DeserializeObject<List<Service>>(jsonServices.ToString());

    foreach(var service in requiredServices)
    {
         services.Add(new ServiceDescriptor(serviceType: Type.GetType(service.ServiceType),
                                            implementationType: Type.GetType(service.ImplementationType),
                                            lifetime: service.Lifetime));
    }
}
```

Then, in the `ConfigureServices` method, call this method with the `services` argument.

Testing the application
-----------------------

The first thing we can do is to add a breakpoint after executing the `ConfigureJsonServices` method.

![](/img/article-photos/aspnet-core-json-dependency-injection/services-breakpoint.JPG)

We can see that our `ITest` service was added and now we can inject it anywhere in our application.

At this point, we can also inject an instance of the service in the `Configure` method and have a message returned from the service:

```
    public void Configure(IApplicationBuilder app, ITest test)
    {
        app.Run(context =>
        {
            var response = test.DoSomething("startup");
            return context.Response.WriteAsync(response);
        });
    }
```

Every time you need to provide another implementation for a service, you don't have to recompile the entire application, simply modify the JSON file and start the application again.

The `Startup` class
-------------------

```
using System;
using System.IO;
using System.Collections.Generic;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        ConfigureJsonServices(services);
    }

    public void Configure(IApplicationBuilder app, ITest test)
    {
        app.Run(context =>
        {
            var response = test.DoSomething("startup");
            return context.Response.WriteAsync(response);
        });
    }

    private void ConfigureJsonServices(IServiceCollection services)
    {
        var jsonServices = JObject.Parse(File.ReadAllText("appSettings.json"))["services"];
        var requiredServices = JsonConvert.DeserializeObject<List<Service>>(jsonServices.ToString());

        foreach(var service in requiredServices)
        {
            services.Add(new ServiceDescriptor(serviceType: Type.GetType(service.ServiceType),
                                               implementationType: Type.GetType(service.ImplementationType),
                                               lifetime: service.Lifetime));
        }
    }
}
```

Conclusion
-----------

This is a very basic and rudimentary way of injecting dependencies in the application. It is by no means production ready, it doesn't deal with exceptions, services that don't exist or incorrect lifetimes.

 
 It is only a simple alternative to registering each service manually, in code, recompiling the entire application evey time you needed to swap some services. 