+++
author = "Radu Matei"
tags = ["wasm", "golang"]
date = "2019-11-03"
description = "Attacks on software repositories happen all the time, and any future WebAssembly repository and client tooling should be prepared to mitigate these attacks. In this article we will explore a minimum security model for WebAssembly registries and client tooling based on The Update Framework, and how to integrate this model when distributing WebAssembly modules using OCI registries. "
linktitle = ""
title = "Securely distributing and signing WebAssembly modules using OCI and TUF"
summary  = "Attacks on software repositories happen all the time, and any future WebAssembly repository and client tooling should be prepared to mitigate these attacks. In this article we will explore a minimum security model for WebAssembly registries and client tooling based on The Update Framework, and how to integrate this model when distributing WebAssembly modules using OCI registries. "
featured = "wasm-to-oci.png"
featuredpath = "/img/article-photos/wasm-to-oci/"
images = ["/img/article-photos/wasm-to-oci/wasm-to-oci.png"]
image = "/img/article-photos/wasm-to-oci/wasm-to-oci.png"
+++

![](/img/article-photos/wasm-to-oci/wasm-to-oci.png)

[In the previous article][wasm-to-oci] we started exploring how the [WebAssembly
System Interface project (WASI)][wasi-announcement] aims to standardize
WebAssembly to run outside of the web by bringing a portable and sandboxed
environment, and how runtimes like [`wasmtime`][wasmtime] come closer and closer
to being a viable alternative to the current container ecosystem. In order to
achieve this, we need a way to distribute WebAssembly modules that is
independent of toolchain - and we used the [OCI Artifacts][oci-artifacts]
project to distribute them using container registries. Taking this line of
thought one step further, we also need a way to ensure the secure delivery of
modules between publishers, registries, and clients - and in this article we
will explore how to use [The Update Framework][tuf] and [Notary][notary] to sign
and validate WebAssembly modules.

### TUF and Notary

Consider the general scenario of a client pulling a target file from a
repository. While the use of SSL / TLS protects the client from
man-in-the-middle attacks, the system is not compromise-resilient - if an
attacker compromises the infrastructure of the registry, they can modify or
change the target file. In other words, the use of SSL / TLS secures the target
file while in transit, but not at rest. This is where [The Update
Framework][tuf] comes into play - a CNCF Incubation project that provides a
_flexible framework and specification that developers can adopt into any
software update system, which helps protect even against attackers that
compromise the repository or signing keys_.

If we were to use TUF to securely distribute WebAssembly modules, the publisher
of a module would:

- sign the content digest of the module using a private key
- push the content digest and the public key used to sign it to a trust server
- push the module to an OCI registry

Then, a client tool that wished to use the module would:

- pull the content digest and public key from the trust server (by performing
  all necessary steps in the [TUF workflow][workflows])
- pull the WebAssembly module from the OCI registry
- compare the signed digest pulled from the trust server with the actual content
  digest of the pulled module. If any verification fails, the client would stop
  execution and abort any further usage of the module.

Following this workflow guarantees protection against a [wide range of possible
attacks][tuf-attacks], and ultimately ensures that the original content of a
module reaches a client unaltered. Of course, there are numerous other types of
attacks that TUF doesn't protect against, and if you are interested in the goals
and non-goals of the TUF project, I recommend you read [the introduction of the
specification][tuf-attacks]. [Notary][notary] is an implementation of TUF used
by multiple container registries through [Docker Content Trust][dct], and we
will use it to perform the TUF workflows for WebAssembly modules.

> Work to implement the TUF workflows for PyPi is underway in [PEP 458][pep1]
> and [PEP 480][pep2].

> The [Cloud Native Application Bundles project (CNAB)][cnab] also proposes the
> use of TUF to ensure the integrity of bundles between registries and clients.
> You can find the [work in progress for the CNAB specification
> here][cnab-spec], as well as draft implementations in [Go][signy] and
> [Python][pysigny]. The example for WebAssembly modules in this article is
> based on the Go integration of Notary done for CNAB.

### Signing and validating WebAssembly modules using TUF

In the next section we will see how to expand the [`wasm-to-oci`][repo] tool we
started in the previous article to perform TUF signatures and verifications.

At a very high level, before pushing the module we're using the Notary client
libraries to:

- initialize a new trust repository - this will generate the signing keys and
  add them to the repository
- add the target WebAssembly module to the repository - specifically, this step
  will compute the content digest of the module, then add it to the `targets`
  role of the collection, with the public part of the key
- publish the repository to the trust server

```
// initialize a new TUF repository
err = notaryRepo.Initialize(rootKeyIDs);

// add our target module to the repository
target, err := notaryClient.NewTarget(name, module, ...)
err = notaryRepo.AddTarget(target,...)

// publish the repository to the TUF server
err = notaryRepo.Publish()
```

The main difference to note here compared to Docker Content Trust is that we are
signing the content digest of the actual WebAssembly module, not of the OCI
manifest, so the signature is persisted regardless of any compression or
archiving operation done by the registry. Integrating this to our existing
functionality, we first push the signed content digest to the trust server, then
push the module to the OCI registry:

```
$ sha256sum testdata/hello.wasm
4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510  testdata/hello.wasm

$ wasm-to-oci push testdata/hello.wasm localhost:5000/hello-wasm-signed:v1
    --sign
    --tlscacert=$NOTARY_CA
    --server https://localhost:4443

INFO[0000] Pushed trust data for localhost:5000/hello-wasm-signed:v1:4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
INFO[0000] Pushed: localhost:5000/hello-wasm-signed:v1
INFO[0000] Size: 1624962
INFO[0000] Digest: sha256:9c82cbe576ee947c00435ac8053a800a1969f4757ae4a81f870f714674afc91a
```

Then, a client that wishes to consume the module will pull the module from the
OCI registry and the trust data from the TUF server, then will compare the two
content digests - if the digests match, the client can further use the module:

```
$ wasm-to-oci pull localhost:5000/hello-wasm-signed:v1
    --sign
    --tlscacert=$NOTARY_CA
    --server https://localhost:4443
    --output test.wasm

INFO[0000] Pulled: localhost:5000/hello-wasm-signed:v1
INFO[0000] Size: 1624962
INFO[0000] Digest: sha256:4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
INFO[0000] Pulled trust data for localhost:5000/hello-wasm-signed:v1, with role targets
INFO[0000] Pulled SHA256: 4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
INFO[0000] Computed SHA: 4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
INFO[0000] The SHA sums are equal: 4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510

$ wasmtime test.wasm
Hello from WebAssembly!
```

But let's explore what happens if the registry infrastructure has been
compromised, and the initial module we published has been either modified, or
replaced with a vulnerable one.

```
# we're inside the OCI registry - we see the module that we pushed earlier
$ sha256sum blobs/sha256/4c/4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510/data
4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510  blobs/sha256/4c/4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510/data

# now let's tamper with the module
# replace it with a vulnerable module and update the OCI manifest

# of course the content digest of the module changed
# sha256sum blobs/sha256/4c/4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510/data
b4a152df0c4ba62a98d00c489b036d4e1e48ed0c2a27ba05d8d489149bc267d5  blobs/sha256/4c/4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510/data
```

Assuming that the attacker also updated the manifests (trivial, if they had
access to the registry), a client can pull the vulnerable module and start using
it:

```
$ wasm-to-oci pull localhost:5000/hello-wasm-signed:v1 -o hacked
INFO[0000] Pulled: localhost:5000/hello-wasm-signed:v1
INFO[0000] Digest: sha256:b4a152df0c4ba62a98d00c489b036d4e1e48ed0c2a27ba05d8d489149bc267d5

$ wasmtime hacked
YOU HAVE BEEN HACKED
```

Now let's perform the same operation, this time by performing the signature
verification first:

```
$ wasm-to-oci pull localhost:5000/hello-wasm-signed:v1
    --sign --tlscacert=$NOTARY_CA
    --server https://localhost:4443

INFO[0000] Pulled: localhost:5000/hello-wasm-signed:v1
INFO[0000] Size: 1624962
INFO[0000] Digest: sha256:4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
INFO[0000] Pulled trust data for localhost:5000/hello-wasm-signed:v1, with role targets -
SHA256: 4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
INFO[0000] Computed SHA: b4a152df0c4ba62a98d00c489b036d4e1e48ed0c2a27ba05d8d489149bc267d5
Error: the digest sum of the artifact from the trusted collection is not equal to the computed digest
4c7915b4c1f9b0c13f962998e4199ceb00db39a4a7fa4554f40ae0bed83d9510
b4a152df0c4ba62a98d00c489b036d4e1e48ed0c2a27ba05d8d489149bc267d5
```

We see that the use of TUF prevents us from using a module that has been
tampered with.

### Conclusion

[Attacks on software repositories][attacks] happen all the time, and any future
WebAssembly repository and client tooling should be prepared to mitigate these
attacks. What we explored in this article represents a minimum security model in
the event of an attack, and while the particular implementations used here for
registry and TUF server (OCI registry and Notary) will most likely not end up
being popular for WebAssembly, the concept of using TUF, or any other framework
that ensures the integrity of modules should be considered for future
implementations.

This concludes the experiment of trying to securely distribute WebAssembly
modules OCI registries and TUF. You can [find the complete implementation of
`wasm-to-oci` used in the articles on GitHub][pr]. Let me know if you have
thoughts on using the methods presented here, or other ideas on ensuring the
integrity when distributing WebAssembly modules.

Thanks for reading!

[wasm-to-oci]: /blog/wasm-to-oci
[wasi]: https://wasi.dev
[wasi-announcement]:
  https://hacks.mozilla.org/2019/03/standardizing-wasi-a-webassembly-system-interface/
[wasmtime]: https://github.com/CraneStation/wasmtime
[oci-artifacts]: https://github.com/opencontainers/artifacts
[repo]: https://github.com/engineerd/wasm-to-oci
[tuf]: https://github.com/theupdateframework/specification
[workflows]:
  https://github.com/theupdateframework/specification/blob/master/tuf-spec.md#5-detailed-workflows
[tuf-attacks]:
  https://github.com/theupdateframework/specification/blob/master/tuf-spec.md#1-introduction
[in-toto]: https://in-toto.io/
[notary]: https://github.com/theupdateframework/notary
[dct]: https://docs.docker.com/engine/security/trust/content_trust/
[pep1]: https://www.python.org/dev/peps/pep-0458/
[pep2]: https://www.python.org/dev/peps/pep-0480/
[cnab-spec]: https://github.com/deislabs/cnab-spec/pull/253
[signy]: https://github.com/engineerd/signy
[pysigny]: https://github.com/engineerd/pysigny/pull/1
[cnab]: https://cnab.io
[attacks]:
  https://github.com/theupdateframework/pip/wiki/Attacks-on-software-repositories
[msm]: https://www.python.org/dev/peps/pep-0480/#maximum-security-model
[pr]: https://github.com/engineerd/wasm-to-oci/pull/1
