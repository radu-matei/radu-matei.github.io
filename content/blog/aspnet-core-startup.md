+++
author = "Radu Matei"
categories = ["aspnet-core"]
date = "2016-07-19"
description = "The ASP .NET Startup class"
featuredalt = ""
featuredpath = "date"
linktitle = ""
title = "ASP .NET Core Startup"
type = "post"

+++


The `Startup` class
==================

Introduction
---------------

In the [previous article](https://github.com/radu-matei/blog-content/blob/master/articles/aspnet-core-getting-started.md) we built a very basic web application that for every request had a very basic response - `Hello, Universe` with the server current time and date.

Any non-trivial application is going to need a mechanism to handle different types of requests and map them to specific services and middleware and configure services. This is accomplished through the `Startup` class, which is also the entry point for any incoming HTTP request.

The anatomy of the `Startup` class
--------------------------------------------

The `Startup` class needs to have two methods: 

- `Configure` - this method will respond to each incoming HTTP request. In the following example, we will use it to have the same functionality as in our previous example - returning a message with the current server time.

> However,  most real-world applications require more functionality than this. More complex sets of pipeline configuration can be encapsulated in [middleware](https://docs.asp.net/en/latest/fundamentals/middleware.html) and added using extension methods on `IApplicationBuilder`.
> 
> Your `Configure` method must accept an [`IApplicationBuilder`](https://docs.asp.net/projects/api/en/latest/autoapi/Microsoft/AspNetCore/Builder/IApplicationBuilder/index.html) parameter. Additional services, like `IHostingEnvironment` and `ILoggerFactory` may also be specified, in which case these services will be injected by the server if they are available. 

- `ConfigureServices` - this **optional** method is used for configuring services used by the application and is called before the `Configure` method.

> This is the place where we will start discussing dependency injection, which will be covered in a separate topic.


Building the `Hello, World` web application with `Startup`
-----------------------------------------------------------------------------

We are going to build the same application that responds with `Hello, World` and the current time, this time with a `Startup` class.

First of all, if this is a new application (created using `dotnet new`), you should add the dependency to the web server Kestrel in `project.json`, which should look like this:

```
{
  "version": "1.0.0-*",
  "buildOptions": {
    "debugType": "portable",
    "emitEntryPoint": true
  },
  "dependencies": {},
  "frameworks": {
    "netcoreapp1.0": {
      "dependencies": {
        "Microsoft.NETCore.App": {
          "type": "platform",
          "version": "1.0.0"
        },
        "Microsoft.AspNetCore.Server.Kestrel": "1.0.0"
      },
      "imports": "dnxcore50"
    }
```
Then, add a new file called `Startup.cs` and add the following code:

```
using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        app.Run(context =>
        {
            var response = String.Format("Hello, Universe! It is {0}", DateTime.Now);
            return context.Response.WriteAsync(response);
        });
    }
}
```
As you can see, the code in `Configure` is the same as the code in `Main` from the previous example.

Then, in the `Main` method we simply indicate that we have a `Startup` class we want to use.
```
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Builder;

namespace ConsoleApplication
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var host = new WebHostBuilder()
                .UseKestrel()
                .UseStartup<Startup>()
                .Build();

                host.Run();
        }
    }
}
```

Now if we run the application (from the command line or from VS Code) and navigate to http://localhost:5000, we see the expected output.


From now on, we will use the `Startup` class when building web applications with ASP .NET Core and we will add middleware and services in it.
