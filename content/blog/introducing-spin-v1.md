---
title: "Spin 1.0 — The Developer Tool for Serverless WebAssembly"
description: "Introducing the first stable release for Spin, the open source developer tool for building, distributing, and running serverless applications built with WebAssembly."
summary: "Introducing the first stable release for Spin, the open source developer tool for building, distributing, and running serverless applications built with WebAssembly."
date: "2023-03-22T16:00:00Z"
tags: ["spin", "wasm"]

canonicalUrl: "https://www.fermyon.com/blog/introducing-spin-v1"
---

_[This post originally appeared on the Fermyon Blog](https://www.fermyon.com/blog/introducing-spin-v1)._

We are delighted to introduce [Spin 1.0](https://github.com/fermyon/spin/releases/tag/v1.0.0), the first stable release of the open source developer tool for building serverless applications with WebAssembly (Wasm)! Since we first [introduced Spin last year](https://www.fermyon.com/blog/introducing-spin), we have been hard at work together with the community on building a frictionless developer experience for building and running serverless applications with Wasm.

For this release, we focused on building support for new programming languages (such as JavaScript, TypeScript, Python, or C#, in addition to Rust and Go), connecting to databases, distributing applications using popular registry services, a built-in key/value store for persisting state, running your applications on Kubernetes, or integrating with HashiCorp Vault for managing runtime configuration.

<!-- break -->

## Serverless and WebAssembly

When serverless made its way into mainstream computing, there was an amazing user story that it promised to deliver: _as a developer, I can focus on writing the business logic of my application, not worry about where my application is running, and only execute my code when it is actually needed_.
The increasing popularity of modern serverless computing offerings suggests that developers resonate with this approach.
However, developers still perceive some fundamental limitations when using serverless today, such as vendor lock-in, portability, or [cold starts](https://mikhail.io/serverless/coldstarts/big3/).

Launched in 2017, [WebAssembly (Wasm)](https://webassembly.org) is a fast and efficient bytecode format originally designed to run non-JavaScript code in the browser. Its [near-native speed](https://00f.net/2023/01/04/webassembly-benchmark-2023), [fast startup time](https://fermyon.github.io/spin-benchmarks/criterion/reports/spin-executor_sleep-1ms/concurrency-1/index.html), true portability, and [sandboxed execution](https://webassembly.org/docs/security), coupled with [the abundance of programming languages with emerging support for compiling to Wasm](https://www.fermyon.com/wasm-languages/webassembly-language-support), make it a compelling packaging and execution format for running code outside the browser.

We believe today, Wasm has the runtime characteristics that can address the limitations of serverless, and with Spin, we want to build the best developer experience for serverless Wasm.

## Hello, Spin!

Spin is an open source developer tool and framework that helps the user through creating, building, distributing, and running serverless applications with Wasm. We can use `spin new` to create a new application based on starter templates, `spin build` to compile our application to Wasm, and `spin up` to run the application locally.

![spin steps](https://www.fermyon.com/static/image/spin-steps.png)

Below is an example of using the `spin` CLI to create a new Spin Python application, then adding a JavaScript component:

```bash
# Create a new Spin application based on the Python language template.
$ spin new http-py hello-python
# Add a new JavaScript component based on the language template.
$ spin add http-js goodbye-javascript
```

Running the `spin add` command will generate the proper configuration for our component and add it to the [`spin.toml` manifest file](https://developer.fermyon.com/spin/manifest-reference). For example, here is the `spin.toml` section for our Python component:

```toml
[[component]]
# The ID of the component.
id = "hello-python"
# The Wasm module to instantiate and execute when receiving a request.
source = "hello-python/app.wasm"
[component.trigger]
# The route for this component.
route = "/hello"
[component.build]
# The command to execute for this component with `spin build`.
command = "spin py2wasm app -o app.wasm"
# The working directory for the component.
workdir = "hello-python"
```

We can now build our application with `spin build`, then run it locally with `spin up`:

```bash
# Compile all components to Wasm by executing their `build` commands.
$ spin build
Executing the build command for component hello-python: spin py2wasm app -o app.wasm
Executing the build command for component goodbye-javascript: npm run build

Successfully ran the build command for the Spin components.
# Run the application locally.
$ spin up
Logging component stdio to ".spin/logs/"

Serving http://127.0.0.1:3000
Available Routes:
  hello-python: http://127.0.0.1:3000/hello
  goodbye-javascript: http://127.0.0.1:3000/goodbye
```

Once the application is running, we can start testing it by sending requests to its components:

```bash
# Send a request to the Python component.
$ curl localhost:3000/hello
Hello, Python!
# Send a request to the JavaScript component.
$ curl localhost:3000/goodbye
Goodbye, JavaScript!
```

When handling a request, Spin will create a new isolated Wasm instance corresponding to the Wasm module for the matching component, execute the handler function, then terminate the instance. Each new request will get a fresh Wasm instance, and we can do this because of the incredibly fast startup time for Wasm instances.

Let's look at some of the features that come with Spin 1.0!

### Language Support

![spin steps](https://www.fermyon.com/static/image/spin-some-languages.png)

A Spin application is composed of one or more _components_ — in the case of web applications, their entry points are handler functions that take an HTTP request as an argument and return a formed HTTP response.  We can write Spin components using any language with a Spin SDK (such as [Rust, TypeScript and JavaScript, Python, Go, or C#](https://developer.fermyon.com/spin/language-support-overview)), or using [any other language that compiles to WASI](https://developer.fermyon.com/spin/other-languages).

First, let's look at the Python component from the previous example, which returned "Hello, Python!" — it is a Python function that takes the HTTP request as an argument, then returns a response:

```
# Import the Response object from the Spin SDK.
from spin_http import Response

# The handler function that returns the response.
def handle_request(request):
    # Return an HTTP response with a status, headers, and body.
    return Response(200,
                    [("content-type", "text/plain")],
                    bytes(f"Hello, Python!", "utf-8"))
```

In JavaScript, we can write an application by following a popular pattern for HTTP handlers, using a router:

```
// Handle the /api/hello route.
router.get("/api/hello", async (req) => {
  return {
    status: 200,
    body: `Hello, Spin! Handling route ${req.url}`
  }
});

// Handle the /api/projects/:id route, and extract the route parameter.
router.get("/api/products/:id", async (req) => {
  return {
    status: 200,
    body: `Handling product ID: ${req.params.id}`
  }
});
```

The handler functions can perform operations such as [fetching data from external APIs](https://developer.fermyon.com/spin/http-outbound), [serving files](https://github.com/fermyon/spin-fileserver), connecting to databases (such as [relational databases](https://developer.fermyon.com/spin/rdbms-storage), or [Redis](https://developer.fermyon.com/spin/redis-outbound)), or [persisting state using Spin's built-in key/value storage](https://developer.fermyon.com/spin/kv-store).

We are continuing the work to improve [the Spin language SDKs](https://developer.fermyon.com/spin/language-support-overview), and we are thankful for the community's continued effort to help and improve our language SDKs.

### Persisting State from Spin Applications

As we have learned in previous sections, Spin will create a new Wasm instance for every request — which makes it best suited for stateless, request/response types of workloads. To address managing state there is a built-in API for [persisting and retrieving non-relational data from a key/value store](https://developer.fermyon.com/spin/kv-store), and Spin 1.0 comes with a default, built-in store available to every Spin application with minimal configuration.

Let's see an example of using this API from a Rust component:

```
// key for the application state
const DATA_KEY: &str = "app-data";

// application state
#[derive(Serialize, Deserialize, Default)]
struct Data {
    views: u64,
}

/// A simple Spin HTTP component.
#[http_component]
fn hello_kv(req: Request) -> Result<Response> {
    // Open the default KV store.
    let kv = Store::open_default()?;

    // Check whether the key already exists.
    let mut data = match kv.exists(DATA_KEY)? {
        // If it exists, get the value and deserialize it.
        true => serde_json::from_slice(&kv.get(DATA_KEY)?)?,
        false => Data::default(),
    };

    // Update the key/value pair using the new data and set its new value.
    data.views += 1;
    let body = serde_json::to_string(&data)?;
    kv.set(DATA_KEY, serde_json::to_vec(&data)?)?;
    ...
}
```

Besides the built-in key/value store, Spin applications can also connect to external databases (such as [relational databases](https://developer.fermyon.com/spin/rdbms-storage), or [Redis](https://developer.fermyon.com/spin/redis-outbound)), or connect to the new class of serverless databases that expose their connections over HTTP. Let's see an example of [using a PlanetScale database from TypeScript](https://github.com/fermyon/spin-js-sdk/tree/main/examples/typescript/planetscale):

```
// Full example at https://github.com/radu-matei/spin-planetscale-f1
import { HandleRequest, HttpRequest, HttpResponse } from "@fermyon/spin-sdk";
// Use the official PlanetScale client.
import { connect } from "@planetscale/database";

export async function handler(_req, res) {
  let conn = connect(auth);

  // Send the queries to the database.
  let [results, races, standings] = await Promise.all([
    conn.execute("SELECT * FROM results"),
    conn.execute("SELECT * FROM races"),
    conn.execute("SELECT * FROM standings"),
  ]);

  // Construct the response.
  let data = {
    races: races.rows,
    results: results.rows,
    standings: standings.rows,
  };

  // Return the response.
  res.status(200).header("content-type", "application/json").body(JSON.stringify(data));
};
```

As WASI matures, we are excited about the [upcoming work in WASI Preview 2 that will bring networking support to WASI](https://github.com/bytecodealliance/preview2-prototyping/blob/4adcbb222fe4a66d496e2ccbf77deaed3b94e1e1/wit/deps/sockets/tcp.wit#L40-L55), which will enable the use of popular database drivers and ORMs from Wasm and Spin applications.

### Distributing Spin Applications Using Registry Services

Registry services such as [GitHub Container Registry](https://ghcr.io), [Docker Hub](https://hub.docker.com/), or, [AWS ECR](https://aws.amazon.com/ecr/) are ubiquitous, and many people are already using them as part of their workflow deploying cloud native applications.

Spin 1.0 [supports distributing applications using such registry services](https://developer.fermyon.com/spin/distributing-apps) — we can push an application using the `spin registry push` command:

```bash
$ spin registry push ghcr.io/radu-matei/hello-spin:v2
Pushed with digest sha256:6f886e428152a32ada6303e825975e1a9798de86977e532991a352d02c98f62c
```

After pushing the application, we can run it using the registry reference by running `spin up -f <reference>`:

```bash
$ spin up -f ghcr.io/radu-matei/hello-spin:v2
Serving http://0.0.0.0:3000
Available Routes:
  hello-python: http://0.0.0.0:3000/hello
  goodbye-javascript: http://0.0.0.0:3000/goodbye
```

### Signing and Verifying Applications Using Sigstore

Since we can distribute Spin applications using popular registry services, we can also take advantage of ecosystem tools such as [Sigstore](https://sigstore.dev) and [Cosign](https://github.com/sigstore/cosign), which address the software supply chain issue by signing and verifying applications using Sigstore's new [keyless signatures](https://docs.sigstore.dev/cosign/keyless/) (using OIDC identity tokens from providers such as GitHub).

We can sign Spin applications using a GitHub identity, and guarantee the identity of the actor who pushed the application to the registry, as well as the integrity of the content pushed:

```bash
# Sign the application using the GitHub identity signed in your browser.
# If running in automation such as GitHub Actions, this can use the OIDC token
# GitHub makes available for workflows.
$ cosign sign ghcr.io/radu-matei/hello-spin@sha256:6f886e428152a32ada6303e825975e1a9798de86977e532991a352d02c98f62c
Generating ephemeral keys...
Retrieving signed certificate...

Successfully verified SCT...
tlog entry created with index: 15825036
Pushing signature to: ghcr.io/radu-matei/hello-spin
```

Now we can verify the integrity of the application by running `cosign verify` and passing the expected issuer and identity of who pushed the application:

```bash
# Verify the content of the artifact at the given digest, as well as the fact
# that the signature has been created by a GitHub actor with the given email.
$ cosign verify ghcr.io/radu-matei/hello-spin@sha256:6f886e428152a32ada6303e825975e1a9798de86977e532991a352d02c98f62c \
  --certificate-oidc-issuer https://github.com/login/oauth \
  --certificate-identity radu@fermyon.com

Verification for ghcr.io/radu-matei/hello-spin@sha256:6f886e428152a32ada6303e825975e1a9798de86977e532991a352d02c98f62c --
The following checks were performed on each of these signatures:
  - The cosign claims were validated
  - Existence of the claims in the transparency log was verified offline
  - The code-signing certificate was verified using trusted certificate authority certificates
```

After verifying the signature and validating the integrity of the application, we can run the application by digest instead of using its tag:

```bash
$ spin up -f ghcr.io/radu-matei/hello-spin@sha256:6f886e428152a32ada6303e825975e1a9798de86977e532991a352d02c98f62c
```

You can integrate this workflow into the process of distributing and running your Spin applications.

### Deploying Spin Applications to Fermyon Cloud

[Fermyon Cloud](https://fermyon.com/cloud) is Fermyon's cloud platform for running serverless Wasm. You can deploy your Spin application and have a running application within seconds. All it takes to sign up for a free account is running `spin login && spin deploy`:

```bash
# Log in to your account or sign up for a new one using `spin login`.
$ spin login
Copy your one-time code: xxxx and open the authorization page in your browser: 
https://cloud.fermyon.com/device-authorization

Device authorized!

# Deploy your application to Fermyon Cloud using `spin deploy`.
$ spin deploy
Uploading hello-spin version 0.1.0+r4a828e1a
Deploying...
Waiting for application to become ready........... ready
Available Routes:
  hello-python: https://hello-spin-feiccjxm.fermyon.app/hello
  goodbye-javascript: https://hello-spin-feiccjxm.fermyon.app/goodbye
```

We [launched Fermyon Cloud in open beta at the end of last year](https://www.fermyon.com/blog/introducing-fermyon-cloud), and we are incredibly happy to see the positive response from the community! As the Spin project and the community evolve, we are excited to build the best place to run your serverless applications with Wasm!

### Deploying Spin Applications to Kubernetes

Besides deploying the application locally and deploying to Fermyon Cloud, you can also deploy your Spin application to Kubernetes using [the new Containerd integration for Spin](https://github.com/deislabs/containerd-wasm-shims/blob/main/containerd-shim-spin-v1/quickstart.md).

You can deploy this on your own cluster (or alternatively, using [KWasm](https://kwasm.sh/)), or you can use the [Azure Kubernetes Service](https://learn.microsoft.com/en-us/azure/aks/use-wasi-node-pools), which can run Spin (and [slight](https://github.com/deislabs/spiderlightning#spiderlightning-or-slight)) applications.

To get started, first configure a new runtime class based on the Containerd integration:

```yaml
apiVersion: node.k8s.io/v1
# Create a new runtime class based on the containerd Wasm integration
# that can run Spin applications.
kind: RuntimeClass
metadata:
  name: "wasmtime-spin-v1"
handler: "spin"
scheduling:
  nodeSelector:
    "kubernetes.azure.com/wasmtime-spin-v1": "true"
```

Then, create a deployment that uses the new runtime class:

```yaml
apiVersion: apps/v1
# Create a new Kubernetes deployment.
kind: Deployment
metadata:
  name: wasm-spin
spec:
  replicas: 3
  selector:
    matchLabels:
      app: wasm-spin
  template:
    metadata:
      labels:
        app: wasm-spin
    spec:
      # Specify the runtime class for this deployment.
      runtimeClassName: wasmtime-spin
      containers:
        - name: hello-spin
          image: ghcr.io/radu-matei/hello-spin-kubernetes
          command: ["/"]
```

To access the application, you will also need to create a Kubernetes service and potentially an ingress. To simplify this operation, we are working on a Spin plugin for Kubernetes that will automatically scaffold and deploy the required Kubernetes objects — check out [`spin k8s`](https://github.com/chrismatteson/spin-plugin-k8s) We are looking forward to the community's feedback on how to improve deploying Spin applications to Kubernetes! If you are interested in this feature, make sure to [reach out on Discord](https://discord.gg/AAFNfS7NGf) or [on Twitter](https://twitter.com/fermyontech).

### Extending Spin With External Triggers and Plugins

[Spin plugins](https://developer.fermyon.com/spin/managing-plugins) are executables that can extend the functionality of Spin without modifying the Spin codebase. In the previous examples, we have used two such plugins, when building Python and JavaScript applications: `spin py2wasm` and `spin js2wasm`, as well as the `spin k8s` plugin.
Anyone can [write a Spin plugin](https://developer.fermyon.com/spin/plugin-authoring) to build support for new language SDKs (like the Python and JavaScript plugins), or to build new Spin triggers.

We are particularly excited about upcoming work to build external queue triggers, such as [the experimental AWS SQS trigger](https://github.com/fermyon/spin-trigger-sqs). Once stabilized, with the plugin installed, `spin up` will be able to start an application that is triggered on new messages with specific attributes on a given queue.

### Beyond Spin 1.0

The main focus for Spin 1.0 has been stabilizing core parts of the `spin new` -> `spin build` -> `spin up` workflow. As a result, there are several features we are looking forward to adding in upcoming minor versions of Spin, such as more triggers, a [`spin watch` command to further improve the inner development loop](https://github.com/fermyon/spin/pull/1237), feature parity for language SDKs, and new services for persistence (including in Spin key/value and relational database APIs).

But perhaps the most exciting is going to be the transition to using [WASI Preview 2](https://github.com/bytecodealliance/preview2-prototyping) and [the Wasm component model](https://www.fermyon.com/blog/webassembly-component-model), which will bring a host of improvements and new features! We are hoping to make significant progress here over the next few months, so stay tuned!

If you have ideas or requests for features or improvements we can make to Spin, make sure to [reach out on Discord](https://discord.gg/AAFNfS7NGf) or [on Twitter](https://twitter.com/fermyontech)!

## Building on Open Source and With the Community

Spin is built using [Wasmtime](https://github.com/bytecodealliance/wasmtime), a popular Wasm runtime built by the [Bytecode Alliance](https://bytecodealliance.org/), and the [Wasm component model proposal](https://www.fermyon.com/blog/webassembly-component-model), and Spin would not be possible without the amazing effort of the maintainers of those projects.

We are excited to contribute back to Wasmtime and the component model, as well as to new projects and proposals emerging in this space (such as new Wasm proposals, like [WASI Preview 2](https://github.com/bytecodealliance/preview2-prototyping), [`wasi-keyvalue`](https://github.com/WebAssembly/wasi-keyvalue), [`wasi-sql`](https://github.com/WebAssembly/wasi-sql) or [`wasi-cloud`](https://github.com/WebAssembly/WASI/issues/520)).

Spin would also not be possible without the more than [50 contributors](https://github.com/fermyon/spin/graphs/contributors) who are dedicating their time to write code and documentation, and without everyone using the project.

## Give It a Spin!

We hope this post got you excited about the possibilities of the Spin project! [Head over to the Spin documentation](https://developer.fermyon.com/spin/quickstart) and build your first Spin application in your favorite programming language today!

We can't wait to see what you build using Spin 1.0!

If you are interested in Spin, [Fermyon Cloud](https://cloud.fermyon.com), or other Fermyon projects, join the chat in the [Fermyon Discord server](https://discord.gg/AAFNfS7NGf) and follow us on Twitter [@fermyontech](https://twitter.com/fermyontech/) and [@spinframework](https://twitter.com/spinframework)!
