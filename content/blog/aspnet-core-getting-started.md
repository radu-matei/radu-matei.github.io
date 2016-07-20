+++
author = "Radu Matei"
categories = ["aspnet-core"]
date = "2016-07-18"
description = "Getting started with ASP .NET Core"
linktitle = ""
title = "ASP .NET Core Introduction"
type = "post"

+++

**Table of Contents**

- [Introduction](#introduction)
- [Getting Started with ASP .NET Core 1.0](#getting-started-with-asp-net-core-10)
- [Make the project a web application](#make-the-project-a-web-application)
- [Conclusion](#conclusion)

Introduction
---------------

> **ASP.NET Core is a new open-source and cross-platform framework for building modern cloud based internet connected applications, such as web apps, IoT apps and mobile backends.** 

> ASP.NET Core apps can run on .NET Core or on the full .NET Framework. It was architected to provide an optimized development framework for apps that are deployed to the cloud or run on-premises. It consists of modular components with minimal overhead, so you retain flexibility while constructing your solutions. You can develop and run your ASP.NET Core apps cross-platform on Windows, Mac and Linux. ASP.NET Core is open source at GitHub.

> The best way to understand what ASP.NET Core is and why it was built is the [Official ASP .NET Core Documentation](https://docs.asp.net/en/latest/intro.html).

ASP .NET Core is a complete re-write of the 4.6 framework that came out last year and comes with a completely new architecture based on .NET Core.

ASP .NET Core is no longer based on`System.Web`. Instead, everything in the framework is modular and comes as NuGet packages which allows you to only include in your application the packages that you will use, resulting in a smaller application footprint and better performance.

It comes with integrated [dependency injection](https://docs.asp.net/en/latest/fundamentals/dependency-injection.html), a new request pipeline middleware and the ability to plug in your own web server (IIS - Windows only or Kestrel inside your own process in Windows, macOS and Linux) and run across operating systems with very similar development processes and tools.

Together with [TypeScript](https://www.typescriptlang.org/), the client-side framework of your choice (Angular 2, React, Aurelia etc), familiar tools for web developers (that didn't have very good support on Windows until very recently) like Grunt, Gulp or Bower and with a superior performance compared to Node, for example, Microsoft bets on ASP .NET Core to become one of the preferred frameworks when building modern web and cloud applications.

> For the complete section on client-side development with ASP .NET Core see [the Official ASP .NET Core Documentation](https://docs.asp.net/en/latest/client-side/index.html).

The ASP .NET Core team made a priority building a great development experience for client-side frameworks and you can see the work-in-progress on the [JavaScriptServices repository on GitHub](https://github.com/aspnet/JavaScriptServices/).

Getting Started with ASP .NET Core 1.0
-----------------------------------------------

The first step in beginning development is to install .NET Core. You should [follow this tutorial on how to get started with .NET Core and build a basic console application](https://github.com/radu-matei/blog-content/blob/master/articles/dot-net-core-getting-started.md).

After installing .NET Core, open a command-line prompt, create a new directory and add a `dotnet` application.

```
mkdir aspnet-core-tutorial
cd aspnet-core-tutorial
dotnet new
```

![](/img/article-photos/aspnet-core-getting-started/powershell-dotnet-new.JPG)

> The same commands work across Windows PowerShell and the macOS and Linux Terminal

To check if everything is in place, execute the following commands:

```
dotnet restore
dotnet run
```

![](/img/article-photos/aspnet-core-getting-started/powershell-dotnet-restore-run.JPG)

> [This tutorial](https://github.com/radu-matei/blog-content/blob/master/articles/dot-net-core-getting-started.md) explains all commands involved here.

> [Install Visual Studio Code](https://github.com/radu-matei/blog-content/blob/master/articles/dot-net-core-getting-started.md#installing-visual-studio-code) and open the project you created.

Make the project a web application
------------------------------------------

As we established earlier, every library in the new .NET Core is a package. So in order to use some packages, we will add them in `project.json` and at compile time, the packages get downloaded from NuGet.

In order to host a web application, we need to have a dependency on the web server - Kestrel. After adding this dependency, the `project.json` file should look like this:

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
  }
}
```

> When running on Windows, we can choose between the classic IIS web server and the new web server Kestrel web server (based on [libuv](https://github.com/libuv/libuv)) that runs across operating systems.

In `Program.cs` we add the following:

```
using System;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

namespace ConsoleApplication
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var host = new WebHostBuilder()
                .UseKestrel()
                .Configure(app => app.Run(context => 
                {
                    var response = String.Format("Hello, Universe! It is {0}", DateTime.Now);
                    return context.Response.WriteAsync(response);
                }))
                .Build();

                host.Run();
        }
    }
}
```

In `Main` we create an instance of `WebHostBuilder`, which follows the [builder pattern](https://en.wikipedia.org/wiki/Builder_pattern) to create a web application host, which then is used to define which web server to use - `.UseKestrel()`.

The `.Build()` and `.Run()` methods will start listening for HTTP requests.

> Even if we create a web app, we started with a console application and added elements that allowed it to start listening for incoming HTTP requests.

> The entry point for web applications in ASP .NET Core is also the `Main` method.

This is a very basic web application. For every request, it will simply respond with `Hello, Universe!` and the current time of the server. It is the most simple application logic and in further examples we will examine handling more complex requests.

```
 .Configure(app => app.Run(context => 
   {
      var response = String.Format("Hello, Universe! It is {0}", DateTime.Now);
      return context.Response.WriteAsync(response);
    }))

```
This is the part that actually creates the response - it is a [Lambda Expression](https://msdn.microsoft.com/en-us/library/bb397687.aspx) that takes the `context` as parameter and writes the response asynchrounously and is called a [request delegate](https://docs.asp.net/en/latest/fundamentals/middleware.html#what-is-middleware).


You can either run the application from the command line (`dotnet run`) or from VS Code.
To run it from VS Code, go to the debugging pane (or press Ctrl/Cmd + Shift + D) and start the application.

After the application starts, open a browser and navigate to http://localhost:5000.
If everything worked as expected, you should see the following:
![](/img/article-photos/aspnet-core-getting-started//aspnet-core-hello-universe-browser.JPG)


Conclusion
-------------

We built a very basic web application starting from the console application template by adding the Kestrel dependency and by using `WebHostBuilder` to create the application host.

We then, for each request we built the response containing a simple message and the current time of the server.
