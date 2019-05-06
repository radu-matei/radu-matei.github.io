+++
author = "Radu Matei"
categories = ["kubernetes", "csharp"]
date = "2019-05-06"
description = "Lightweight controllers for your custom resource definitions, in C#"
linktitle = ""
title = "Writing controllers for Kubernetes CRDs with C#"
type = "post"
summary = "The goal of this article is to show you how to use the Kubernetes C# client to write extremely simpel controllers for your Kubernetes custom resources, and start watching resources in a few lines of C#"
+++

# Introduction

If you want to interact with the Kubernetes cluster API, the most obvious choice for the programming language is Go. Since Kubernetes itself is written in Go, it naturally became the _de facto_ language for interacting with the API, and writing controllers is no exception.

You even have multiple choices for writing a Go controller - you can directly use the [Go client][client-go], and follow the implementation of this [controller sample][controller-example], or you can use [Kubebuilder][kubebuilder], [Metacontroller], or the awesome [`operator-sdk`][operator-sdk], all of which give you a starting point for creating controllers that interact with custom resources.

Additionally, [`operator-sdk`][operator-sdk] also gives you an entire tool for generating CRDs from your Go structures, and integrated commands to compile, test, and run your controllers as you are developing them, making the experience of building such a component a much leaner experience. And although at times it can feel like there's _too_ much magic happening behind the scenes with `operator-sdk`, it is _by far_ the best experience to writing an operator in Go.

That being said, not everything is perfect in the world of `client-go`. Go dependency management is sometimes challenging, with `client-go` you have to understand _a lot_ of packages to perform the easiest of tasks, and sometimes it's just not possible to use Go to build your controller.

A few days ago, Matt Butcher shared a [Rust library that simplifies writing a controller][operator-rs], which got me wondering:

{{< tweet 1124403345135939585 >}}

How difficult is it today to build controllers for CRDs in other programming languages? As it turns out, the Rust library makes it really easy to get started, with a really nice API.

And since I haven't written C# in quite some time, I decided this would be a nice experiment for my Research Friday (although it did continue a bit through the weekend).

# Using the C# client to build a controller

There is a [C# client for Kubernetes][kubernetes-csharp], whith has great examples, and we are going to use it in building our controller. Besides the usual CRUD operations that you can do with the client, you can also _watch_ for various resources - we listen on a given resource, and then we handle the events that take place:

```csharp
var result = await _client.ListNamespacedCustomObjectWithHttpMessagesAsync(
                group: "api group",
                version: "version,
                namespaceParameter: "namespace",
                plural: "examples",
                watch: true);

result.Watch<T>((type, item) => _handle(type, item));
```

This is pretty much the building block for our entire controller - but notice the generic type `T` on `Watch<T>` method - it is supposed to handle custom resources of type `T` - but how does a custom resource look like? Here's an example:

```
apiVersion: engineerd.dev/v1alpha1
kind: Example
metadata:
  creationTimestamp: "2019-05-05T21:10:44Z"
  generation: 1
  name: my-cr-example
  namespace: kubecontroller
  resourceVersion: "12456473"
  selfLink: /apis/engineerd.dev/v1alpha1/namespaces/kubecontroller/examples/my-cr-example
  uid: 3eced7fe-6f7a-11e9-ae81-fad9608c9dfa
spec:
  <fields for your custom resource specification>
status:
  <fields for the status of your custom resource>
```

All Kubernetes custom resources have:

- `apiVersion` - this describes the version for your object, and [this article][apiversion-blog] describes what each API version means, and which one you should use
- `kind` - this is the type of your custom resources, and it is defined when creating the custom resource definition
- `metadata` (depending on type, this can be an object, or a list metadata)

Then, you have:

- `spec`
- `status`

These fields can be used to encapsulate your own business logic in the custom resource, and describe the desired and current state of the resource.


And because we want to cast the resources we watch to some C# types, we need to have a class structure for the CRD. Luckily, the C# client comes in extrenely handy, and provides us with an object that contains the `apiVersion` and `kind`, in the [`KubernetesObject`][kubernetes-object], and an object that encapsulates the metadata, in [`V1ObjectMeta`][object-meta].

This means that we have to add the `spec` and (optionally) `status` for our CRD, and this is (on a high level) what the `CustomResource` class in the project looks like:

```csharp
    public abstract class CustomResource<TSpec, TStatus>
    {
        public V1ObjectMeta Metadata { get; set; }
        public TSpec Spec { get; set; }
        public TStatus Status { get; set; }
    }
```

> In reality, there is a base, non-generic, [`CustomResource`][custom-resource] class, that contains the metadata, and the class above inherits it. This is merely syntactic sugar to avoid having to meddle with too many generics in the actual controller, and for the purpose of this article, the `CustomResource` class can be considered the one above.

Creating the type for your CRD comes down to building a C# class that mirrors your custom resource.

> There is certainly room for improvement here - we could:
> -  generate the YAML for the CRD from the C# classes, or
> - generate the C# classes from the CRD

> While nice to have, both of them fall outside the scope of the article (and like all snarky University professors do, we'll just leave this as homework for the reader, but do let me know if generating these for C# or other languages is of interest to you.).

# Wrapping everything in a `Controller` class

Now that we have the building blocks, we can create a library that contains the custom resource class we see above (and another class that contains some metadata about your CRD, such as group and namesapce) and build a [class for our controller][controller].

We include a cancellation token, an instance of the Kubernetes client, and some metadata for the CRD, then pass a handler method to execute for changes in our custom resources, and we end up with a library that can be consumed from a C# console library as follows (for a CRD that [can be found in the repository][crd-cr]):

```csharp
var crd = new CustomResourceDefinition()
{
    ApiVersion = "engineerd.dev/v1alpha1",
    PluralName = "examples",
    Kind = "Example",
    Namespace = "kubecontroller"
};

var controller = new Controller<ExampleCRD>(
    new Kubernetes(KubernetesClientConfiguration.BuildConfigFromConfigFile()),
    crd,
    (WatchEventType eventType, ExampleCRD example) =>
        Console.WriteLine("Event type: {0} for {1}", eventType, example.Metadata.Name));

var cts = new CancellationTokenSource();
await controller.StartAsync(cts.Token);
```

And so we end up with a really, really simple controller, where for every change, we write the event type and name of the resource to the console. Did I say this is a very simple controller?

Can this be improved? Sure, it's a rather naive approach to building one, but you can see the building blocks for handling changes for your custom resources. You can find [the current state of this controller library (as of writing this article) in this branch of the GitHub repository][article-branch].

# Conclusion

In this article, we used the C# client for Kubernetes to build a very simple controller that watches a custom resource for changes.

As it turns out, this was much easier than I anticipated before starting, and the end result is arguably a lot simpler than its Go counterpart. Sure, all the Go libraries, together with the community resources, give you much more to work with, and I'm not arguing that anyone should stop using Go to write controllers.

But if the Rust and C# clients tell us anything about Kubernetes controllers, is that for the simplest use cases, implementing them in other languages might actually allow us to get started much easier (without having a `hack` directory in our repository and depending on executing Bash scripts to generate APIs).

What other things would you need in a C# controller library for Kubernetets? Would you like to see this as a NuGet package? Feel free to [open an issue on the repository][issues], and feel free to send feedback.

Thanks for reading!

[client-go]: https://github.com/kubernetes/client-go
[controller-example]: https://github.com/kubernetes/sample-controller
[kubebuilder]: https://kubernetes.io/blog/2018/08/10/introducing-kubebuilder-an-sdk-for-building-kubernetes-apis-using-crds/
[metacontroller]: https://metacontroller.app/
[operator-sdk]: https://github.com/operator-framework/operator-sdk
[operator-rs]: https://github.com/clux/operator-rs
[kubernetes-csharp]: https://github.com/kubernetes-client/csharp
[apiversion-blog]: https://matthewpalmer.net/kubernetes-app-developer/articles/kubernetes-apiversion-definition-guide.html
[kubernetes-object]: https://github.com/kubernetes-client/csharp/blob/master/src/KubernetesClient/IKubernetesObject.cs
[object-meta]: https://github.com/kubernetes-client/csharp/blob/master/src/KubernetesClient/generated/Models/V1ObjectMeta.cs
[custom-resource]: https://github.com/engineerd/kubecontroller-csharp/blob/article/KubeController/CustomResource.cs
[controller]: https://github.com/engineerd/kubecontroller-csharp/blob/article/KubeController/Controller.cs
[crd-cr]: https://github.com/engineerd/kubecontroller-csharp/tree/article/KubeController.Sample/deploy
[article-branch]: https://github.com/engineerd/kubecontroller-csharp/tree/article
[issues]: https://github.com/engineerd/kubecontroller-csharp/issues
