---
title: "The state of CNAB: Part 2 - CNAB Registries"
description: "In this series, we explore the state of the Cloud Native Application Bundles (CNAB) specifications, and do a deep dive into the distribution of bundles, and security and attestation."
summary: "In this series, we explore the state of the Cloud Native Application Bundles (CNAB) specifications, and do a deep dive into the distribution of bundles, and security and attestation."
date: 2019-09-05 00:00:00 +0000 UTC
author: "Radu Matei"
image: "/img/article-photos/cnab/cnab-twitter-card.png"
canonicalUrl: "https://deislabs.io/posts/state-of-cnab-part-2"
---

![](/img/article-photos/cnab/cnab-twitter-card.png)

_[This article originally appeared on the DeisLabs blog](https://deislabs.io/posts/state-of-cnab-part-2/)_.

In [the previous entry, we discussed the CNAB Core specification][part1], which does not dictate how bundles should be distributed. This is intentional, so organizations that need the bundle representation CNAB brings, but already have a way of distributing artifacts may continue to use it.

That being said, the CNAB Registries specification wants to propose a standard way of using OCI registries to distribute bundles, which we will explore in this article.

In August, [the OCI Technical Oversight Board adopted the artifacts proposal][artifacts], which aims to use OCI registries to store additional artifacts (in addition to container images), such as Helm charts, or Singularity charts.

Let's take a step back and think about what a CNAB bundle is - a collection of metadata and container images that are needed for an application. It is not a _single_ new artifact, but it represents a _collection of multiple artifacts_.

An [OCI image index (or simply OCI index)][oci-index] represents a collection of container images stored in a repository - so rather than using a new artifact, we could use an OCI index to represent CNAB and store the bundle file and referenced images.

## Storing bundles in OCI registries using [`cnab-to-oci`][cnab-to-oci]

> Note that in the following sections we are not going to discuss the distribution of CNAB bundles across disconnected ("air-gapped") environments - this is not because the scenario isn't supported by CNAB, but because its implementation is closely connected with bundle verification and attestation. If you are interested in this scenario, [please join the CNAB community][meetings] and the group working on this issue.

And this is exactly the approach of [`cnab-to-oci`][cnab-to-oci] - the proposed implementation to store bundles in OCI registries. But before diving into how `cnab-to-oci` works, and how to use it, it is worth exploring some requirements we collected for any implementation that would store bundles in OCI registries:

1. Signing and verifying CNAB bundles must be possible for any distribution method, as the core specification does not mandate the use of OCI registries.

To support this, any implementation must represent the [CNAB bundle file][bundle-json] in [canonical JSON][cjson] form, which can be used to compute the content digest consistently, regardless of the distribution method used. The [proposed changes to the `cnab-to-oci`][cnab-to-oci-pr] ensure that bundles are stored in canonical JSON.

2. Moving a bundle across repositories (and potentially compliant registries) must not invalidate the bundle signature.

This is directly related to how container images (and any potential artifact types) are represented in OCI registries - by their name and registry location.

Consider the following (simplified, and non-canonical) bundle file:

```
{
  "images": {
    "my-microservice": {
      "contentDigest": "sha256:aaaaaaaaaaaa...",
      "image": "org1/microservice:1.2.3"
    }
  },
  "invocationImages": [
    {
      "contentDigest": "sha256:aaaaaaa...",
      "image": "org1/invocation:0.1.0",
    }
  ],
  "schemaVersion": "v1.0.0-WD",
  "version": "0.1.2"
}
```

It references two container images: `org1/microservice:1.2.3`, and `org1/invocation:0.1.0`. If we wanted to move the referenced images from `org1` to `org2`, we automatically change the bundle file, which results in a new content digest of the bundle file, meaning any signature based on this content digest is invalidated - even if the the content of the bundle or of the referenced images has not changed.

> Note that the same scenario also applies when all images referenced in a bundle have been pushed to the same repository, and we want to move them to a new repository.

This is where the [CNAB Core specification comes to help][image-relocation-spec]:

> Images referenced by a CNAB bundle MAY be relocated, for example by copying them to a private registry. A relocation mapping is a JSON map of original image references to relocated image references. The purpose of a relocation mapping is to enable an invocation image to substitute relocated image references for their original values.

> [...] image references which differ only by tag and/or digest are not semantically equivalent (even though they could refer to the same image).

The statements above can be interpreted as follows: you can relocate the container images referenced in a bundle to new registries / repositories, as long as all digests of the relocated images are equal for all images. Then, at runtime, a relocation map file containing the new image locations can be passed, and if the digests of the original and relocated images are equal, the relocated image can be used (provided any other security verifications pass for said component).

It is necessary to include the need for digests to be equal because currently, two registry implementations can generate two different image digests for the same content.

> This happens because you cannot control the archiving algorithm used by registries - so the same content (image) can be archived in two different ways, yielding two different content digests, resulting in different OCI descriptors (manifests).

By moving the images to new repositories / registries and generating a relocation map, we ensure we can safely move bundles and their images without invalidating the initial bundle signature - and [the proposed changes to `cnab-to-oci`][cnab-to-oci-pr] ensure that.

3. Continue to enable bundle authors to choose how to store referenced artifacts in registries.

If you build a bundle right now, you can reference images from any combination of registries and repositories (for example, some organizations want to push all artifacts referenced in a bundle in the same repository, while others want separate repositories, or even separate registries).

Ideally, an implementation for storing bundles in OCI registries would continue to support the scenarios described above. Currently, however, this area hasn't been fully explored in `cnab-to-oci`, which pushes all images referenced in a bundle in the same repository (more on being able to reference artifacts outside of a repository from an OCI index later).

That being said, there has been extensive work in the community, on [image relocation][pivotal-image-relocation] and [registry utilities][ggcr], to ensure images can be moved across registries and repositories. Ideally, we could use this work in `cnab-to-oci` and give users a choice of how to push the images referenced in a bundle - in the same repository, or in different repositories.

## Using `cnab-to-oci` today

> For the purpose of this article, we are going to use the [the proposed changes to `cnab-to-oci`][cnab-to-oci-pr] that ensure points 1 and 2 - bundle files are stored in canonical JSON form, and a relocation map is generated when pushing images to new repositories.

> Also note that the actual user experience when pushing and pulling bundles will most likely differ between various tools. The `cnab-to-oci` CLI is one implementation of what arguments and parameters can be passed, and of how users would interact with the tool.

Let's explore how to use `cnab-to-oci` right now, and how a bundle and its artifacts are represented in the registry:

```
$ cnab-to-oci push examples/helloworld-cnab/bundle.json
            --target localhost:5000/cnab-test:v1
            --log-level debug
            --auto-update-bundle

DEBU[0000] Fixing up bundle localhost:5000/cnab-test:v1
DEBU[0000] Updating entry in relocation map for "cnab/helloworld:0.1.1"
Starting to copy image cnab/helloworld:0.1.1...
Completed image cnab/helloworld:0.1.1 copy
DEBU[0004] Bundle fixed
DEBU[0004] map[cnab/helloworld:0.1.1:localhost:5000/cnab-test@sha256:a59a4e74d9cc89e4e75dfb2cc7ea5c108e4236ba6231b53081a9e2506d1197b6]
DEBU[0004] Pushing CNAB Bundle localhost:5000/cnab-test:v1
DEBU[0004] Pushing CNAB Bundle Config
DEBU[0004] Trying to push CNAB Bundle Config
DEBU[0004] CNAB Bundle Config Descriptor
DEBU[0004]
{
    "mediaType": "application/vnd.cnab.config.v1+json",
    "digest": "sha256:ba1c8f64781d8745ea9d004c5b24f2a1a0ff8fae4883c870aa4d30e77c6081f0",
    "size": 494
}

DEBU[0004] Trying to push CNAB Bundle Config Manifest
DEBU[0004] CNAB Bundle Config Manifest Descriptor
DEBU[0004]
{
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "digest": "sha256:47728a6b9381dd715001a376a690b7e625a5deef22423fdefd176f8d4f32a8fc",
    "size": 188
}

DEBU[0005] CNAB Bundle Config pushed
DEBU[0005] Pushing CNAB Index
DEBU[0005] Trying to push OCI Index
DEBU[0005]
{
    "schemaVersion": 2,
    "manifests": [
        {
            "mediaType": "application/vnd.oci.image.manifest.v1+json",
            "digest": "sha256:47728a6b9381dd715001a376a690b7e625a5deef22423fdefd176f8d4f32a8fc",
            "size": 188,
            "annotations": {
                "io.cnab.manifest.type": "config"
            }
        },
        {
            "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
            "digest": "sha256:a59a4e74d9cc89e4e75dfb2cc7ea5c108e4236ba6231b53081a9e2506d1197b6",
            "size": 942,
            "annotations": {
                "io.cnab.manifest.type": "invocation"
            }
        }
    ],
    "annotations": {
        "io.cnab.keywords": "[\"helloworld\",\"cnab\",\"tutorial\"]",
        "io.cnab.runtime_version": "v1.0.0-WD",
        "org.opencontainers.artifactType": "application/vnd.cnab.manifest.v1",
        "org.opencontainers.image.authors": "[{\"name\":\"Jane Doe\",\"email\":\"jane.doe@example.com\",\"url\":\"https://example.com\"}]",
        "org.opencontainers.image.description": "A short description of your bundle",
        "org.opencontainers.image.title": "helloworld",
        "org.opencontainers.image.version": "0.1.1"
    }
}
DEBU[0005] OCI Index Descriptor
DEBU[0005]
{
    "mediaType": "application/vnd.oci.image.index.v1+json",
    "digest": "sha256:93fd4727cd317c3e035a3ce02e2201a01322a4b673142ba8ee6a8532c9f3ca40",
    "size": 929
}

DEBU[0005] CNAB Index pushed
DEBU[0005] CNAB Bundle pushed
Pushed successfully, with digest "sha256:93fd4727cd317c3e035a3ce02e2201a01322a4b673142ba8ee6a8532c9f3ca40"
```

- we use the `cnab-to-oci` binary to _push_ a bundle to an OCI registry; we pass the path to the bundle file, and the location of our OCI registry
- the purpose of the `--auto-update-bundle` flag is to specify whether the runtime should stop the operation if, while pushing any image referenced in the bundle, the new digest generated by the new repository / registry differs from the original bundle (this addresses point 2 from the earlier section).
- first, the "fixup" operation pushes all images referenced in the bundle (images and invocation images) to their new repository (`localhost:5000/cnab-test`), and generates a relocation map, or directly mutates the bundle
- next, the bundle file (in its canonical JSON representation) is pushed, and a bundle config descriptor (of media type `application/vnd.cnab.config.v1+json`) is generated
- finally, the index is constructed and pushed - in the `manifests` list, it contains an entry for the bundle descriptor, and entries for all images and invocation images referenced in the bundle
- the final digest of the index descriptor is returned

Now let's explore what happens when we pull the bundle we just pushed:

```
$ cnab-to-oci pull localhost:5000/cnab-test:v1 --log-level debug
DEBU[0000] Pulling CNAB Bundle localhost:5000/cnab-test:v1
DEBU[0000] Getting OCI Index Descriptor
DEBU[0000] {
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "digest": "sha256:93fd4727cd317c3e035a3ce02e2201a01322a4b673142ba8ee6a8532c9f3ca40",
  "size": 929
}
DEBU[0000] Fetching OCI Index sha256:93fd4727cd317c3e035a3ce02e2201a01322a4b673142ba8ee6a8532c9f3ca40
DEBU[0000] {
  "schemaVersion": 2,
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "sha256:47728a6b9381dd715001a376a690b7e625a5deef22423fdefd176f8d4f32a8fc",
      "size": 188,
      "annotations": {
        "io.cnab.manifest.type": "config"
      }
    },
    {
      "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
      "digest": "sha256:a59a4e74d9cc89e4e75dfb2cc7ea5c108e4236ba6231b53081a9e2506d1197b6",
      "size": 942,
      "annotations": {
        "io.cnab.manifest.type": "invocation"
      }
    }
  ],
  "annotations": {
    "io.cnab.keywords": "[\"helloworld\",\"cnab\",\"tutorial\"]",
    "io.cnab.runtime_version": "v1.0.0-WD",
    "org.opencontainers.artifactType": "application/vnd.cnab.manifest.v1",
    "org.opencontainers.image.authors": "[{\"name\":\"Jane Doe\",\"email\":\"jane.doe@example.com\",\"url\":\"https://example.com\"}]",
    "org.opencontainers.image.description": "A short description of your bundle",
    "org.opencontainers.image.title": "helloworld",
    "org.opencontainers.image.version": "0.1.1"
  }
}
DEBU[0000] Getting Bundle Config Manifest Descriptor
DEBU[0000] {
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "digest": "sha256:47728a6b9381dd715001a376a690b7e625a5deef22423fdefd176f8d4f32a8fc",
  "size": 188,
  "annotations": {
    "io.cnab.manifest.type": "config"
  }
}
DEBU[0000] Getting Bundle Config Manifest sha256:47728a6b9381dd715001a376a690b7e625a5deef22423fdefd176f8d4f32a8fc
DEBU[0000] {                                                                                                              "schemaVersion": 2,
  "config": {
    "mediaType": "application/vnd.cnab.config.v1+json",
    "digest": "sha256:ba1c8f64781d8745ea9d004c5b24f2a1a0ff8fae4883c870aa4d30e77c6081f0",
    "size": 494
  },
  "layers": null
}
DEBU[0000] Fetching Bundle sha256:ba1c8f64781d8745ea9d004c5b24f2a1a0ff8fae4883c870aa4d30e77c6081f0
DEBU[0000] {
  "schemaVersion": "v1.0.0-WD",
  "name": "helloworld",
  "version": "0.1.1",
  "description": "A short description of your bundle",
  "keywords": [
    "helloworld",
    "cnab",
    "tutorial"
  ],
  "maintainers": [
    {
      "name": "Jane Doe",
      "email": "jane.doe@example.com",
      "url": "https://example.com"
    }
  ],
  "invocationImages": [
    {
      "imageType": "docker",
      "image": "cnab/helloworld:0.1.1",
      "digest": "sha256:a59a4e74d9cc89e4e75dfb2cc7ea5c108e4236ba6231b53081a9e2506d1197b6",
      "size": 942,
      "mediaType": "application/vnd.docker.distribution.manifest.v2+json"
    }
  ]
}
DEBU[0004] Relocation map map[cnab/helloworld:0.1.1:localhost:5000/cnab-test@sha256:a59a4e74d9cc89e4e75dfb2cc7ea5c108e4236ba6231b53081a9e2506d1197b6]
```

- we use the same `cnab-to-oci` binary to pull the bundle
- the OCI descriptor is pulled, which points to the actual OCI index; the index contains an entry in the `manifests` object to the bundle manifest descriptor, which points to the actual CNAB bundle file (in canonical JSON form).
- the `bundle.json` file is fetched (and a relocation mapping is generated, which can be used at runtime, according to the description in point 2).

> Note that if the registry does not support using an OCI index, `cnab-to-oci` has fallback mechanisms and will try to use a Docker manifest list.

We have seen how we can use `cnab-to-oci` to store bundles in supporting registries today, and hopefully now we have a better understanding of how all of it works.

## Changes to the OCI Index

But how is the OCI index we are using to store CNAB bundles identified as representing a CNAB bundle? Right now, `cnab-to-oci` relies on an annotation to achieve this:

```
"org.opencontainers.artifactType": "application/vnd.cnab.manifest.v1"
```

But as [annotations are an optional part of the OCI specification][oci-annotations], using them to identify a bundle cannot be a long-term solution.
Moreover, without additional ways of reliably identifying that an index is used to represent a CNAB bundle, tools or platforms that assume an OCI index is a multi-architecture container image might unintentionally fail.

But why were annotations chosen in the first place?

An OCI index lacks a top-level mechanism for communicating its type - this is one of the topics [discussed during KubeCon in Barcelona at a meeting about OCI artifacts and CNAB registries][kubecon], and the general consensus was to propose a top-level `config` object for the OCI index that would provide _deterministic understanding of the artifact type_.

> [You can find complete notes from that meeting here][kubecon].

Setting a `mediaType` on the `config` object for an OCI index would allow CNAB tooling to stop relying on optional annotations from identifying one, and enable registries to either allow or reject CNAB artifacts.
[This change is coming, and you can see the progress and comment on it here][oci-config-pr].

Another change we could explore once the OCI index contains a `config` object is storing the `bundle.json` file in this object - this would allow us to stop storing the bundle config (the `bundle.json` file) as a separate artifact (see the `application/vnd.cnab.config.v1+json` descriptor), and entirely rely on the new capabilities of the OCI index. Such a change, however, must not interfere with storing the bundle in its canonical JSON form, and we must ensure sure the content of the bundle file (and thus its signature) is persisted as well in this scenario. This is a change we will explore in `cnab-to-oci` after the OCI index contains a `config` object.

The second set of changes that was discussed for the OCI index is related to how artifacts referenced in a CNAB bundle should be stored in a registry / repository. As mentioned, `cnab-to-oci` currently pushes all images in a single repository - but as we have seen in requirement 3, ideally users could choose to use a different model to store the images (and individual registries could restrict how they allow images to be pushed).

At the same time, an OCI index can only reference manifests that are in the same repository - this means that while `bundle.json` can reference artifacts in any number of registries and repositories, without them being referenced in the index, that information is opaque to the registry.
This does _not_ affect any CNAB functionality, but having a list of all artifacts used by a CNAB bundle, even if they are _not_ in the same repository, would allow registries to perform much more interesting tasks - such as garbage collection, or security analysis on all components of a bundle.

Essentially, we're looking for a way that an OCI index could point to a manifest that is outside of the repository (or potentially even outside of the registry). This is a more complex change, and all implications have not been explored yet.

## CNAB Registries - next steps

The current state of `cnab-to-oci` unblocks our immediate use case of representing CNAB bundles in registries using the OCI index - but as implementations and real-world use cases for this scenario mature, we need a reliable way of identifying an OCI index - and we believe the addition of the `config` object to be extremely important.

Moving forward, the conversations around the OCI index also become relevant in the context of representing collections of cloud-native artifacts (see the [artifacts project][artifacts] mentioned at the beginning of the article).

If you are interested in this discussion, please [join the weekly CNAB meetings][meetings], as well as the [OCI weekly meetings][oci-meetings].

Now that we have a validated implementation for storing CNAB bundles in OCI registries, and the discussions with the OCI community around formalizing the usage of the OCI index for this scenario are underway, the next step is to begin capturing the intended workflows and behaviors in the official CNAB Registries specification.

Finally, CNAB is a community project. The work done so far in the registry space has been highly collaborative, and we would like to thank everyone involved with the project, and everyone who reviewed this article!

In the next article, we will explore the security aspects of CNAB - signing, verifying, and attesting bundles, and how it integrates with the registry work we just presented.

[part1]: https://deislabs.io/posts/state-of-cnab-part-1/
[artifacts]: https://github.com/opencontainers/tob/pull/60
[techcrunch]: https://techcrunch.com/2018/12/04/microsoft-and-docker-team-up-to-make-packaging-and-running-cloud-native-applications-easier/
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
[porter]: https://github.com/deislabs/porter
[app]: https://github.com/docker/app
[pivotal-build-service]: https://content.pivotal.io/blog/pivotal-build-service-now-alpha-assembles-and-updates-containers-in-kubernetes
[pivotal-function-service]: https://pivotal.io/platform/pivotal-function-service
[docker-enterprise]: https://blog.docker.com/2019/07/announcing-docker-enterprise-3-0-ga/
[riff]: https://projectriff.io/blog/2019/08/21/announcing-riff-0-4-0
[code]: https://github.com/deislabs/duffle-vscode
[bag]: https://github.com/deislabs/duffle-bag
[post1]: https://github.com/deislabs/cnab-spec/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22Post+1.0%22
[ras]: https://en.wikipedia.org/wiki/RAS_syndrome
[oras]: https://github.com/deislabs/oras
[cnab-to-oci]: https://github.com/docker/cnab-to-oci
[artifacts]: https://github.com/opencontainers/artifacts
[oci-index]: https://github.com/opencontainers/image-spec/blob/master/image-index.md
[cnab-to-oci-pr]: https://github.com/docker/cnab-to-oci/pull/65
[image-relocation-spec]: https://github.com/deislabs/cnab-spec/blob/master/103-bundle-runtime.md#image-relocation
[pivotal-image-relocation]: https://github.com/pivotal/image-relocation
[ggcr]: https://github.com/google/go-containerregistry
[oci-annotations]: https://github.com/opencontainers/image-spec/blob/master/annotations.md
[cjson]: http://wiki.laptop.org/go/Canonical_JSON
[kubecon]: https://hackmd.io/w6pY2gAVSq6tD_exH7_f0g#Index-Conversations
[oci-config-pr]: https://github.com/radu-matei/image-spec/pull/1
[meetings]: https://cnab.io/community-meetings/#registry-and-security-community-meeting
[oci-meetings]: https://www.opencontainers.org/community
