+++
author = "Radu Matei"
categories = ["wasm"]
date = "2019-10-13"
description = ""
linktitle = ""
title = "Distributing WebAssembly modules using OCI registries"
type = "post"
summary = ""
featured = "wasm-to-oci.png"
featuredpath = "/img/article-photos/wasm-to-oci/"
images = ["/img/article-photos/wasm-to-oci/wasm-to-oci.png"]
+++

# WebAssembly and WASI

[WebAssembly (WASM)][wasm] _is a binary instruction format for a stack-based virtual machine._ In familiar terms, WASM is used as a compilation target for various programming languages (C, C++, Rust, or Golang, for example), generating a compact binary with a known format. [Mozilla Developer Network describes][mdn-concepts] WebAssembly as having _huge implications for the web platform — it provides a way to run code written in multiple languages on the web at near native speed, with client apps running on the web that previously couldn’t have done so._

The very big implication here is being able to execute modules on the web _at near native speed_. Tasks that have historically had low performance when written in JavaScript can be rewritten in high performance programming languages, like C++, or Rust.

But WebAssembly isn't only for the web. The [WebAssembly System Interface project (WASI)][wasi-announcement] aims to standardize WebAssembly to run outside of the web by providing an abstraction over the tasks of the operating system. This brings two major advantages: portability, and security. Today, you can use runtimes like [`wasmtime`][wasmtime] to execute WASM modules on a variety of operating systems (Linux, macOS, Windows), in a sandboxed environment with granular access to the file system and network.

And if you're thinking: _wait a second - aren't those advantages also mentioned when talking about containers?_

{{< tweet 1111004913222324225 >}}

WASI could provide a very interesting alternative to the container ecosystem - but for this article, we are only interested in discussing how to distribute WebAssembly modules.

> Read [the WASI announcement blog post][wasi-announcement] if you want to learn more about how it works, and the principles behind WASI.

# Distributing WASM modules using OCI registries

Right now there are a couple of ways to distribute WASM modules - [`wasm-pack`][wasm-pack-publish] (which uses NPM to store modules), or [WAPM][wapm] (independent of programming language and toolchain, but still a very early stage tool, without much adoption yet outside of the Wasmer ecosystem), to name a few. But if we consider WASM as a potential cross-platform alternative to Linux containers, then we also need a way to distribute them, independent of programming language and toolchain. And why not use exactly the method for distributing container images, OCI registries?

Additionally, OCI recently announced [the OCI Artifacts project][oci-artifacts], which aims to extend the OCI registry specification and store other cloud native artifacts (think about Helm charts, or CNAB bundles). This has immediate advantages - a consistent way to distribute multiple artifacts type, using already existing registry services, or reusing and extending the current security model (like[TUF][tuf]).

[ORAS][oras] (OCI Registry as Storage) is a proposed implementation for the OCI Artifacts project, and significantly simplifies storing arbitrary content in OCI registries. So we could use the ORAS client library to build a really simple tool to push and pull WebAssembly modules to OCI registries.

Note however, that currently, most registry services reject an unknown artifact type - and ORAS has been tested with [the open source Docker Distribution project][distribution] and [Azure Container Registry][acr].

First step is defining the media types we are going to associate WebAssembly modules - this helps identifying the artifact type, and can be used when configuring a registry to explicitly allow or disallow storing them.

```
ConfigMediaType       = "application/vnd.wasm.config.v1+json"
ContentLayerMediaType = "application/vnd.wasm.content.layer.v1+wasm"
```

In order to push, we read the contents of the module, add them as a single layer in an OCI descriptor, then use `oras.Push`:

```
	contents, err := ioutil.ReadFile(module)

	desc := store.Add(module, ContentLayerMediaType, contents)
	layers := []ocispec.Descriptor{desc}

	pushOpts := []oras.PushOpt{
		oras.WithConfigMediaType(ConfigMediaType),
		oras.WithNameValidation(nil),
	}

	manifest, err := oras.Push(ctx, resolver, ref, store, layers, pushOpts...)
```

Pulling is similarly straightforward - we use `oras.Pull` to get the OCI manifest and actual module, then write it to a file:

```
	pullOpts := []oras.PullOpt{
		oras.WithAllowedMediaType(ContentLayerMediaType),
		oras.WithPullEmptyNameAllowed(),
	}

	_, layers, err := oras.Pull(ctx, resolver, ref, store, pullOpts...)
	manifest, contents, _ := store.Get(layers[0])
	ioutil.WriteFile(outFile, contents, 0755)
```

The Go package and a `wasm-to-oci` utility [can be found on GitHub][wasm-to-oci].

# Testing with an OCI registry

We have a local module (which can be found in the `testdata` directory of the [repo][wasm-to-oci]), and we use the `wasm-to-oci` to push to an Azure Container Registry repository that we are currently logged in to (using the Docker CLI):

```
$ ls
.rwxr-xr-x 1.6M radu  hello.wasm

$ wasm-to-oci push hello.wasm <oci-registry>.azurecr.io/wasm-to-oci:v1
Pushed: <oci-registry>.azurecr.io/wasm-to-oci:v1
Size: 1624962
Digest: sha256:4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
```

At this point, we can use the same utility to pull from the repository we just pushed, then use a WebAssembly runtime of choice to execute the module:

```
$ wasm-to-oci pull <oci-registry>.azurecr.io/wasm-to-oci:v1 --out test.wasm

Pulled: <oci-registry>.azurecr.io/wasm-to-oci:v1
Size: 1624962
Digest: sha256:4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510

$ wasmtime test.wasm
Hello from WebAssembly!

$ wasmer run test.wasm
Hello from WebAssembly!
```

We can inspect the generated OCI manifest, and see the media types we set earlier, together with the digests and size of the manifest and actual module:

```
{
  "schemaVersion": 2,
  "config": {
    "mediaType": "application/vnd.wasm.config.v1+json",
    "digest": "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    "size": 2
  },
  "layers": [
    {
      "mediaType": "application/vnd.wasm.content.layer.v1+wasm",
      "digest": "sha256:4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510",
      "size": 1624962
    }
  ]
}
```

# Conclusion

This was an interesting proof of concept for storing WASM in OCI registries. Most likely you don't need this if you're using WebAssembly on the web right now, but it can be useful in the context of WASI, and particularly considering this extremely cool [containerd shim for WebAssembly][containerd-wasm].

[wasm]: https://webassembly.org
[wasi]: https://wasi.dev
[wasi-announcement]: https://hacks.mozilla.org/2019/03/standardizing-wasi-a-webassembly-system-interface/
[wasi-talk]: https://www.youtube.com/watch?v=fh9WXPu0hw8
[mdn-wasm]: https://developer.mozilla.org/en-US/docs/WebAssembly
[mdn-concepts]: https://developer.mozilla.org/en-US/docs/WebAssembly/Concepts
[wasm-pack-publish]: https://rustwasm.github.io/wasm-pack/book/commands/pack-and-publish.html
[wapm]: https://wapm.io/
[oci-artifacts]: https://github.com/opencontainers/artifacts
[wasmtime]: https://github.com/CraneStation/wasmtime
[tuf]: https://theupdateframework.github.io/
[oras]: https://github.com/deislabs/oras
[distribution]: https://github.com/docker/distribution
[acr]: https://docs.microsoft.com/en-us/azure/container-registry
[wasm-to-oci]: https://github.com/engineerd/wasm-to-oci
[containerd-wasm]: https://github.com/dmcgowan/containerd-wasm
