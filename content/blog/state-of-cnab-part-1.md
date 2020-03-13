---
title: "The state of CNAB: Part 1 - CNAB Core"
description: "In this series, we explore the state of the Cloud Native Application Bundles (CNAB) specifications, and do a deep dive into the distribution of bundles, and security and attestation."
summary: "In this series, we explore the state of the Cloud Native Application Bundles (CNAB) specifications, and do a deep dive into the distribution of bundles, and security and attestation."
date: 2019-09-04 00:00:00 +0000 UTC
author: "Radu Matei"
image: "/img/article-photos/cnab/cnab-twitter-card.png"
canonicalUrl: "https://deislabs.io/posts/state-of-cnab-part-1"
---

![](/img/article-photos/cnab/cnab-twitter-card.png)

_[This article originally appeared on the DeisLabs blog](https://deislabs.io/posts/state-of-cnab-part-1/)_.

Late last year, the [CNAB (Cloud Native Application Bundles)][what-cnab] specification was announced - [the news made it to TechCrunch][techcrunch] and other tech publications, and partner organizations wrote about how they're using CNAB (for example [Docker][docker-app], [Pivotal][pivotal], or [Bitnami][bitnami]).

So what is CNAB? According to [the official specification][core]:

> CNAB is a standard packaging format for multi-component distributed applications. It is not a platform-specific tool, and developers can bundle applications targeting environments spanning IaaS (like OpenStack or Azure), container orchestrators (like Kubernetes or Nomad), container runtimes (like local Docker or ACI), and cloud platform services (like object storage or Database as a Service).

But let's take a step back and recap what problems CNAB is trying to solve:

> 1. We need to be able to describe our application as a single artifact, even when it is composed of a variety of cloud technologies;
> 2. We must be able to provision our applications without having to master dozens of tools; and
> 3. We need to manage lifecycle (particularly installation, upgrade, and deletion) of our applications.
>
> [You can read an introduction to CNAB][what-cnab], and here you can find the [CNAB announcement blog post][cloudblogs].

The same introduction document introduced the desired functionality CNAB hoped to bring:

> Broadly, CNAB brings several features that aren’t currently in the ecosystem:

> 1. Manage discrete resources as a single logical unit that comprises an app.
> 2. Use and define operational verbs for lifecycle management of an app (install, upgrade, uninstall).
> 3. Sign and digitally verify a bundle, even when the underlying technology doesn’t natively support it.
> 4. Attest (or attach a signature to any moment in the lifecycle of that bundle) and digitally verify that the bundle has achieved that state to control how the bundle can be used.
> 5. Enable the export of the bundle and all dependencies to reliably reproduce in another environment, including offline environments (IoT edge, air-gapped environments).
> 6. Store bundles in repositories for remote installation.

In the months following the initial announcement, the specification was split into three separate specifications:

- [CNAB Core][core] - addresses 1, 2, and part of 5.

- [CNAB Registries][registries] - addresses part of 5 and 6.

- [CNAB Security][security] - addresses 3 and 4.

(Two more sub-specifications followed, for [claims][claims] and [bundle dependencies][dependencies].)

Why break down into multiple specifications in the first place? The scope of the problem is objectively broad, and it's much easier to iterate and agree on a subset of changes, with a reduced problem space. Also, all other areas depended on the core specification, so it made sense to reach a stability point there, then turn to the other parts of the ecosystem.
So as a community, we decided to focus on having a stable core specification first.

But this doesn't come without any risks - the most obvious is potentially realizing that the core specifications needs (breaking) changes in order to accommodate distribution or security. We hope this will not be the case, and we think that we've covered potential issues (adding [custom extensions][custom-extensions], [custom actions][custom-actions], handling [image relocation][image-relocation] without mutating the bundle, to name a few), but realizing another part of the ecosystem will only work with a future CNAB Core 2.0 is a possibility until those parts reach stability.

## [The CNAB Core Specification][core]

The core specification covers the following areas:

- [the `bundle.json` file][bundle-json]
- [the invocation image format][invocation-image]
- [the bundle runtime][runtime]
- [the bundle formats][bundle-formats]

This is the area of CNAB that has seen the most interest so far, and at the beginning of August, a core [specification freeze][core-freeze] has been instated, stabilizing the core specification even more, and allowing [the reference implementation][duffle] and other tools implementing the specification (such as [Porter][porter] or [Docker App][app]) to implement the latest changes.

Of course following the specification freeze [a number of issues have been raised regarding some clarifications][issues], but none of them has lead to major changes.

So what does stabilizing the core specification mean for the community?
It means that you can build a bundle with tool A, install it with tool B, then upgrade it or uninstall it with tool C - so the following workflow could be possible:

```
$ porter build <bundle>
$ porter publish <bundle>
$ docker app install <bundle>
$ duffle uninstall <bundle>
```

> The arguments and flags passed to the tools above are not representative.

> There is also a [list of issues deferred for a post 1.0 version of the core specification][post1] - and as the tools using CNAB mature, that list is expected to grow.

## Where is CNAB used today?

There are multiple public (and even more still private) projects that implement parts of the CNAB specification, or use CNAB as a way of deployment:

- [Duffle][duffle] is the reference implementation of the specification, and its goal is to provide functionality for all parts of the specification. You can use it to build, install, and manage bundles, as well as export bundles in thick format for distributing in air-gapped environments.
- [Porter][porter] is an opinionated CNAB builder that _gives you building blocks to create a cloud installer for your application, handling all the necessary infrastructure and configuration setup. It is a declarative authoring experience that lets you focus on what you know best: your application._
- [Docker App][docker-app] is an opinionated CNAB builder and installer that leverages the Docker Compose format to define your applications. To facilitate developer to operator handover, you can add metadata and runtime parameters. These applications can easily be shared using existing container registries. Docker App is available as part of the [the latest Docker release][docker-enterprise].
- the [Pivotal Build Service (alpha)][pivotal-build-service], _a declarative way to build an OCI-compatible container image from source code_, and is using CNAB to deploy the service on Kubernetes clusters.
- the next alpha release of [Pivotal Function Service][pivotal-function-service] (a platform for building and running Functions, Applications, and Containers on Kubernetes, based on the [Project Riff (v0.4.0)][riff] open source project) is likely to be distributed as (CNAB) bundles.
- [VS Code extension][code] and [graphical installer for bundles][bag] - graphical user interfaces for interacting with CNAB bundles
- several groups in Azure are also evaluating the use of CNAB as a delivery and operational pillar.

If a tool or platform wants to be CNAB compliant, it must implement the core specification, but it can choose _not_ to implement the distribution or security specifications.
(One example for this scenario is a team that needs the application definition of a bundle, but already has mechanisms in place for distributing it, and ways of attesting the provenance. This team could decide to only implement the CNAB Core specification.)

Finally, CNAB is a community effort, and we would like to thank everyone involved with the project!

In the next article, we will discuss the distribution of CNAB bundles.

[techcrunch]: https://techcrunch.com/2018/12/04/microsoft-and-docker-team-up-to-make-packaging-and-running-cloud-native-applications-easier/
[what-cnab]: https://deislabs.io/cnab/
[cloudblogs]: https://cloudblogs.microsoft.com/opensource/2018/12/04/announcing-cnab-cloud-agnostic-format-packaging-running-distributed-applications/
[docker-app]: https://blog.docker.com/2018/12/docker-app-and-cnab/
[bitnami]: https://engineering.bitnami.com/articles/production-ready-packaging-with-cnab-and-bitnami-kubernetes-production-runtime-bkpr.html
[pivotal]: https://content.pivotal.io/blog/pivotal-build-service-now-alpha-assembles-and-updates-containers-in-kubernetes
[core]: https://github.com/deislabs/cnab-spec/blob/master/100-CNAB.md
[registries]: https://github.com/deislabs/cnab-spec/blob/master/200-CNAB-registries.md
[security]: https://github.com/deislabs/cnab-spec/blob/master/300-CNAB-security.md
[claims]: https://github.com/deislabs/cnab-spec/blob/master/400-claims.md
[dependencies]: https://github.com/deislabs/cnab-spec/blob/master/500-CNAB-dependencies.md
[bundle-json]: https://github.com/deislabs/cnab-spec/blob/master/101-bundle-json.md
[invocation-image]: https://github.com/deislabs/cnab-spec/blob/master/102-invocation-image.md
[runtime]: https://github.com/deislabs/cnab-spec/blob/master/103-bundle-runtime.md
[bundle-formats]: https://github.com/deislabs/cnab-spec/blob/master/104-bundle-formats.md
[core-freeze]: https://github.com/deislabs/cnab-spec/pull/238
[custom-extensions]: https://github.com/deislabs/cnab-spec/blob/master/101-bundle-json.md#custom-extensions
[custom-actions]: https://github.com/deislabs/cnab-spec/blob/master/101-bundle-json.md#custom-actions
[image-relocation]: https://github.com/deislabs/cnab-spec/blob/master/103-bundle-runtime.md#image-relocation
[issues]: https://github.com/deislabs/cnab-spec/issues
[duffle]: https://github.com/deislabs/duffle
[porter]: https://porter.sh
[app]: https://github.com/docker/app
[pivotal-build-service]: https://content.pivotal.io/blog/pivotal-build-service-now-alpha-assembles-and-updates-containers-in-kubernetes
[pivotal-function-service]: https://pivotal.io/platform/pivotal-function-service
[docker-enterprise]: https://blog.docker.com/2019/07/announcing-docker-enterprise-3-0-ga/
[riff]: https://projectriff.io/blog/2019/08/21/announcing-riff-0-4-0
[code]: https://github.com/deislabs/duffle-vscode
[bag]: https://github.com/deislabs/duffle-bag
[post1]: https://github.com/deislabs/cnab-spec/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22Post+1.0%22
