+++
author = "Radu Matei"
tags = ["dotnet-core"]
date = "2016-07-23"
description = "Creating a configurable Greeting service with ASP .NET Core, using Dependency Injection"
linktitle = ""
title = "ASP .NET Core JSON Configuration and Dependency Injection"
# type = "post"
summary = "The new configuration system provides support for JSON, XML, INI and for in-memory configuration, while also allowing you to create your custom configuration provider. Let's assume that in our application we want the response messages not to be hard-coded in Startup anymore, but stored in a configuration file so we don't have to stop, modify or recompile our application every time the messages or the routes change."
+++

<!-- Table of Content
----------------

- [Introduction](#introduction)
- [Using the ASP .NET Core JSON Configuration Provider](#using-the-asp-net-core-json-configuration-provider)
- [Building the configurable Greeting service](#building-the-configurable-greeting-service)
- [Making use of ASP .NET Core Dependency Injection](#making-use-of-asp-net-core-dependency-injection)
- [Conclusion](#conclusion)

Introduction
--------------- -->
> This article was originally written in July 2016, and has been updated in November 2019 to the latest .NET Core 3 version, and the [updated sample can be found in this GitHub repository](https://github.com/radu-matei/dotnetcore-samples/tree/dotnetcore3/dotnetcore3-configuration).

In the previous versions of ASP .NET, any configuration setting or parameter you needed was added in `web.config` [(complete description of the old `web.config` file)](http://www.codeproject.com/Articles/301726/Web-config-File-ASP-NET), or added in a separate XML file and referenced in `web.config` (for scenarios like database connection strings, or storing APIs access tokens).

The new configuration system provides support for JSON, XML, INI and for in-memory configuration, while also allowing you to [create your custom configuration provider](https://docs.asp.net/en/latest/fundamentals/configuration.html#custom-config-providers).

Let's assume that in our application we want the response messages not to be hard-coded in `Startup` anymore, but stored in a configuration file so we don't have to stop, modify or recompile our application every time the messages or the routes change.

More clearly, we want to map the keys from the JSON file below as routes and the values as the responses we want our application to give, so when a user browses in our application to `/some-route`, if `some-route` is present in the JSON configuration file, then the response will be the value from the file, if else to display a default message.

```
{
    "hi": "Hi!",
    "hello": "Hello!",
    "bye": "Goodbye!",
    "default": "This is default!"
}
```

Also, if we modify the configuration file while the application is running, our application should be able to use the latest configuration. (As we will see, we will not have much to do here since this is built into ASP .NET).

There can be any number of defined paths in our configuration file and they can change with any frequency (so that hard-coding them in our application is not an option).

### Using the ASP .NET Core JSON Configuration Provider

As we said earlier, the new ASP .NET implements a JSON configuration provider that allows us to read and use configurations from JSON files (and not only), and we can have strong typing (where we define classes for our configuration settings) or we can access them using directly their key.

> For a complete article on creating [Strongly Typed Configuration Settings in ASP .NET Core, see this article by Rick Strahl](https://weblog.west-wind.com/posts/2016/May/23/Strongly-Typed-Configuration-Settings-in-ASPNET-Core).

To use configuration settings in ASP .NET Core, simply instantiate a `Configuration` object (using a `ConfigurationBuilder`)  and indicate the source of the JSON file. Then, we can add multiple sources and types of sources that populate our application's configuration.

> At its simplest, `Configuration` is just a collection of sources, which provide the ability to read and write name/value pairs. If a name/value pair is written to `Configuration`, it is not persisted. This means that the written value will be lost when the sources are read again.

> Developers are not limited to using a single configuration source. In fact several may be set up together such that a default configuration is overridden by settings from another source if they are present.



Because at the time when we write the application we can't know the exact paths, we will not create strongly-typed configurations but we will take the path from our application an check to see wether that path exists in our configuration file.

### Building the configurable Greeting service

First of all, we create a new web application using the `dotnet` CLI, then, we create a new file, `greetings.json`, in the same directory as our `Program.cs`, `Startup.cs` files, where we add our custom routes and messages we want our application to respond with:

```
{
    "hi": "Hi!",
    "hello": "Hello!",
    "bye": "Goodbye!",
    "default": "This is default!"
}
```

In `Startup` we create a property of type `IConfiguration` where we will keep the data from the configuration file, the add a constructor for the `Startup` class that will instantiate a `ConfigurationBuilder`, which will populate the configuration object:

```
public IConfiguration Configuration { get; set; }
public Startup()
{
    var cb = new ConfigurationBuilder(IWebHostEnvironment env)
        .SetBasePath(Directory.GetCurrentDirectory())
        .AddJsonFile("greetings.json", optional: false, reloadOnChange: true);

    Configuration = cb.Build();
}
```

The constructor has an `IWebHostEnvironment` parameter that can be used to establish the directory of the JSON configuration file. Since we placed it in the same folder as the other files, we can simply get the current directory: `Directory.GetCurrentDirectory()`.

After we instantiate the `ConfigurationBuilder` we chain two method calls - one for establishing the directory of the configuration file, the other for determine the actual name of the file. Then, we call the `.AddJsonFile()` method takes the following arguments:

- the name of the file - in our case `greetings.json`
- a `bool` that determines wether this configuration file is optional or not, used to determine the order in which the system searches the files (if there are multiple files) if the same configuration name exists in multiple files.
- a `bool` that specifies what happens if the configuration file is modified while the application is running - `reloadOnChange`

Next, we add routing to our application:

```
public void ConfigureServices(IServiceCollection services)
{
    services.AddRouting();
}
```

Now it's time to put everything together in the `Configure` method:

```
public void Configure(IApplicationBuilder app)
{
    var rb = new RouteBuilder(app);
    rb.MapGet("{route}", ctx =>
    {
        var routeMessage = Configuration.AsEnumerable()
            .FirstOrDefault(r => r.Key == ctx.GetRouteValue("route")
            .ToString())
            .Value;

        var defaultMessage = Configuration.AsEnumerable()
            .FirstOrDefault(r => r.Key == "default")
            .Value;

        return ctx.Response.WriteAsync(routeMessage ?? defaultMessage);
    });

    app.UseRouter(rb.Build());
}
```

We create a new `RouteBuilder` and map a new `GET` request, then read the route parameter and try to retrieve it from our configuration file, through `Configuration`, which contains all configuration data:
```
var routeMessage = Configuration.AsEnumerable()
    .FirstOrDefault(r => r.Key == context.GetRouteValue("route")
    .ToString())
    .Value;
```

We know that our configuration is now accessible through the `Configuration` property that we populated in the `Startup` constructor, and the configuration settings are an `IEnumerable<KeyValuePair<string, string>>`, that is a collection of key-value pairs of strings, so we can use Linq to search for the key-value pair in our file that has the same key as our path and take the value from that pair.

> For some examples of using Linq with lambdas [check this article from Code Magazine](http://www.codemag.com/article/1001051).

We also search for the default message in our JSON so that if the path does not exist in the file, we have a standard response.

```
var defaultMessage = Configuration.AsEnumerable()
    .FirstOrDefault(r => r.Key == "default")
    .Value;
```

Then, depending on wether the route actually exists in our configuration file or not, we return either the message of that specific route, or the default message.

If we run the application and open a browser, we can check if our routing works:

```
http://localhost:5000/hello - This should display Hello!
http://localhost:5000/hi - This should display Hi!
http://localhost:5000/bye - This should display Goodbye!
http://localhost:5000/default or http://localhost:5000/anything-else - This should display This is default!
```

Without closing the application, go to `greeting.json` and either add a new key-value pair, or modify an existing one's value, save the file and navigate to that path. You will see that the application was able to load the configuration file without restarting or recompiling.

### Making use of ASP .NET Core Dependency Injection

> For a more detailed view of dependency injection in ASP .NET Core applications, [read the article from the Official ASP .NET Core Documentation](https://docs.asp.net/en/latest/fundamentals/dependency-injection.html).

Our application works, but there is a lot of logic code in `Startup`, a place for configuration.

We will try to extract the part of `Startup` that deals with actually getting the response from the `JSON` file in a separate class and learn how to inject that service in various places (like other services, controllers or even in `Startup`).

First of all, let's think at what public methods and properties should a greeting service should have. Basically, it should only have a single method that receives the path a user navigated to and should return a string, the response taken from the JSON file.

In order to make dependency injection work, we will make use of interfaces. Meaning we will build an interface for the greeting service, `IGreetingService`.

> To see an example with interfaces, [check this tutorial](https://github.com/microsoft-dx/csharp-fundamentals/tree/master/CSharpFundamentals/csharp09%20-%20Interfaces).

Let's create a new file, `IGreetingService.cs`:
```
public interface IGreetingService
{
    string Greet(string route);
}
```

Now, in another file, `GreetingService.cs` we will add the actual implementation of the service:

```
using System.Linq;
using Microsoft.Extensions.Configuration;

public class GreetingService : IGreetingService
{
    private IConfiguration Configuration {get;set;}

    public GreetingService(IConfiguration configuration)
    {
        Configuration = configuration;
    }
    public string Greet(string route)
    {
            var routeMessage = Configuration.AsEnumerable()
                .FirstOrDefault(r => r.Key == route)
                .Value;

            var defaultMessage = Configuration.AsEnumerable()
                .FirstOrDefault(r => r.Key == "default")
                .Value;

            return (routeMessage != null) ? routeMessage : defaultMessage;
    }
}
```

Basically, this class has the `Greet` method which contains most of the logic we had in `Startup` for retrieving  the response from the JSON file. It also has an `IConfiguration` property, this time injected in the controller (we will see a bit later where and how this is done).

Now let's take a look at the `Startup` class, this time at the `Configure` method:

```
public void Configure(IApplicationBuilder app, IGreetingService greetingService)
{
    var routeBuilder = new RouteBuilder(app);

    routeBuilder.MapGet("{route}", context =>
    {
        var route = context.GetRouteValue("route").ToString();
        return context.Response.WriteAsync(greetingService.Greet(route));
    });

    app.UseRouter(routeBuilder.Build());
}
```

The new thing here is that we have an `IGreetingService` parameter in the method signature that we use when returning the message.

Both the `IGreetingService` and `IConfiguration` parameters are configured in the `ConfigureServices` method, also from `Startup`:

```
public void ConfigureServices(IServiceCollection services)
{
    services.AddRouting();

    services.Add(new ServiceDescriptor(typeof(IConfiguration),
                    provider => new ConfigurationBuilder()
                                .SetBasePath(Directory.GetCurrentDirectory())
                                .AddJsonFile("greetings.json",
                                                optional: false,
                                                reloadOnChange: true)
                                .Build(),
                    ServiceLifetime.Singleton));

    services.AddTransient<IGreetingService, GreetingService>();
}
```

First of all we add the routing service (just like in the previous examples).

The last line of this method states that every time some class requests a parameter of type `IGreetingService`, the DI (dependency injection) engine will provide it with a new (every time a new) implementation of `GreetingService`.

The second method call is the most difficult of all: it says that every time someone requests an `IConfiguration` parameter, the engine should provide the same instance (singleton) generated by this chain of method calls:
```
 new ConfigurationBuilder()
    .SetBasePath(Directory.GetCurrentDirectory())
    .AddJsonFile("greetings.json",
                 optional: false,
                 reloadOnChange: true)
     .Build(),
```

which is the same as earlier.


### Conclusion

We created a web application for which we configured the paths and the associated responses in an external JSON file. We extracted this functionality in a service, `GreetingService` that was provided using dependency injection.
