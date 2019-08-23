+++
author = "Radu Matei"
categories = ["github"]
date = "2019-08-23"
description = "How to build reusable actions using the Actions toolkit"
linktitle = ""
title = "Building Reusable GitHub Actions in TypeScript, using the official toolkit"
type = "post"
featured = "actions-logo.png"
featuredpath = "/img/article-photos/building-github-actions/"
summary = "How to build reusable actions using the Actions toolkit"
images = ["/img/article-photos/building-github-actions/actions-logo.png"]
+++

> Disclaimer: while [GitHub is now a part of Microsoft][acquisition], and I work at Microsoft, I am not part of the team building Actions, and this is me documenting my experience building one - not the official position of the team building GitHub Actions.

# Introduction

[GitHub Actions now supports CI/CD][actions-announcement] - and while the workers for Actions come [pre-configured with support for lots of programming languages and frameworks][software], you have the option to use an existing action to configure the environment, or build your own.

The [official GitHub organization for Actions][actions] contains actions to set up custom versions for [NodeJS][node], [Python][py], or [Java][java], and you can directly import them in your workflow file - for example, setting up a custom version for Go:

```yaml
steps:
  - name: Setup go
    uses: actions/setup-go@v1
    with:
      go-version: <your-go-version>
```

Breaking that down, it points to the [`actions/setup-go`][go] repository, [following semantic version][version] (more on versioning later), and it accepts a custom argument - `go-version`, which is defined by the action.

Our goal for this article is to build our own custom action, with [the same toolkit][toolkit] that is used to build all official actions.

[There are two types of actions that can be defined][types]:

- JavaScript actions, which are executed directly on the host
- Docker actions, which are executed in a container - [here's a full walkthrough for building a Docker action][docker-action].

For this article, we're exploring how to build a JavaScript action.

# JavaScript Actions

In [a previous article][article] we saw how to configure Kind (Kubernetes in Docker) inside a GitHub Actions job - but what if we want to reuse the setup across tens of repositories? Do we copy-paste the same configuration? How about unit testing? What if there's a change needed? There's a better way - with JavaScript actions, and at the end of the article, we'll see a GitHub action for Kind I built.


First step, we use a template for this action to bootstrap our repository - navigate to https://github.com/actions/javascript-template, and click on _Use this template_ - it will allow you to create a new repository in one of your accounts using this template.

![](/img/article-photos/building-github-actions/node12-template.png)

> If you don't know about template repositories, go ahead the and [read the announcement blog post][template-repos].


There are two important files we need to look at - first is the action definition file:

```
name: "The name of your action"
description: "Description"
author: "Engineerd"
inputs:
  myInput:
    description: "Input to use"
    default: "world"
runs:
  using: "node12"
  main: "lib/main.js"
```

This file contains metadata about our action, information about the runtime and entrypoint, and definitions for the inputs. All other inputs that we are going to use in the actions will be defined here.

The other one is the entrypoint for the action (the transpiled `.js` files are found in `lib/` - the source code that you modify is in `src/` - you can change the destination for the transpiled code, but make sure to change the `.tsconfig`, `action.yml`, and `package.json` files with the appropriate directory.)

```
import * as core from '@actions/core';                                                                                                     
async function run() {
  try {
    const myInput = core.getInput('myInput');
    console.log(`Hello ${myInput}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}
run();
```

Next, we'll see how to accomplish usual tasks that you might encounter in building a custom action.

### Inputs for Actions

Custom inputs are defined in the `actions.yml` file (see how `myInput` is defined in the example above), and are passed to the GitHub Actions runtime as environment variables, following the naming schema `INPUT_<input-name>`. 

Then, consumers of the action will set the value for an input in the `with` field of the action:

```
    - uses: <org>/<action>@<version>
        with:
            myInput: "value for myInput"  
```

Reading inputs in the action is done through [the `@action/core` library, which exposes a helper function, `core.getInput`][inputs].

```
import * as core from '@actions/core';

let input = core.getInput('myInput');
```
Keep in mind that all inputs are parsed as strings, and you have to be careful when casting to other types.

The same `@action/core` package also exposes methods for exporting environment variables, secrets, adding directories to path, or logging.

### Downloading tools, adding them to the path

Another task you might encounter when building a custom action is downloading tools and adding them to the path.

The `@actions/tool-cache` package comes with a `downloadTool` method that you can use to pull files from a remote URL:

```
import * as tc from '@actions/tool-cache';

let url: string = `<URL for downloading the tool>`;
let downloadPath: string | null = null;
downloadPath = await tc.downloadTool(url);
```

If the tool you are downloading is platform dependent, you should check the runtime operating system and architecture first and download the correct file. Also, files are currently downloaded without extension.

At this point, `downloadPath` will contain the tool you just downloaded. Setting the right permissions for a file to be executable is again platform dependent. For example, on UNIX you can use `chmod`:

```
import * as exec from '@actions/exec';

await exec.exec("chmod", ["+x", downloadPath]);
```

Now that the file we downloaded is executable, let's move it to a directory in path so future steps can use it.
If you're trying to move things to `/usr/local/bin`, you won't have the right permissions - so let's just create a new directory and add it to path:

```
import * as io from '@actions/io';

const binPath: string = "/home/runner/bin";
await io.mkdirP(binPath);
await io.mv(downloadPath, path.join(binPath, "<name-of-your-tool>"));
```

Make sure to change the name of the tool accordingly when moving it, since the file in `downloadPath` will have an auto-generated name.

Next, adding the directory we just created to the path:

```
core.addPath(binPath);
```

Let's recap: we downloaded a file from a remote URL, made it an executable, and moved it to a directory that is in path. Any subsequent step that is declared after this action will have access to the tool we downloaded.

### Using files from the repository

If the action you're building is executed _after_ the checkout action, you have access to all files in the repository. However, keep in mind the current directory you're executing in is a temporary directory, so you have to construct the right path to the files in the repo:

```
import * as path from 'path';

const wd: string = process.env[`GITHUB_WORKSPACE`] || "";
const absPath: string = path.join(wd, "path-relative-to-the-repo-root");
```
> See [the article dedicated to the environment in Actions for a complete list of environment variables][env].


> See the [official documentation for the toolkit][toolkit] for complete description on how to use each package.

> | Package | Description |
>  ------- | ----------- |
> | [@actions/core](https://github.com/actions/toolkit/tree/master/packages/core) | Core functions for getting inputs, > setting outputs, setting results, logging, secrets and environment variables |
> | [@actions/exec](https://github.com/actions/toolkit/tree/master/packages/exec) | Functions necessary for running > tools on the command line |
> | [@actions/io](https://github.com/actions/toolkit/tree/master/packages/io) | Core functions for CLI filesystem > scenarios |
> | [@actions/tool-cache](https://github.com/actions/toolkit/tree/master/packages/tool-cache) | Functions necessary for >downloading and caching tools |
> | [@actions/github](https://github.com/actions/toolkit/tree/master/packages/github) | An Octokit client hydrated with >the context that the current action is being run in |


### Testing

The template uses Jest for testing - you can either use it, or replace it with your favorite JavaScript libraries for testing - [here's an example of using Mocha and Chai][action-test].

You might want to test you're getting the correct input - you can use the naming schema for environment variables:

```
const testEnvVars = {
    INPUT_MYINPUT: 'some-input',
};

describe("checking input parsing", function () {
    beforeEach(() => {
        for (const key in testEnvVars)
            process.env[key] = testEnvVars[key as keyof typeof testEnvVars]
    });
    it("correctly parse input", () => {
      let input = core.getInput('myInput');
      assert.equal(input, testEnvVars.INPUT_MYINPUT);
    });
});
```

This might not be necessarily required, but if you're constructing complex object based on the input data, you might want to ensure all values are correctly parsed, from environment variables all the way to your objects.

### Versioning and publishing to the GitHub marketplace

Versioning is the area with, in my opinion, the most room for improvement - you can use tags, branches, commit SHAs, or `@master` (although highly discouraged):

```
steps:
    - uses: actions/setup-node@74bc508
    - uses: actions/setup-node@v1
    - uses: actions/setup-node@master  # not recommended
```

Currently, the branch you point to must have both `node_modules` (highly encouraged to only have production dependencies in release branches / tags) and `lib` (the directory with the transpiled project) checked in - this branch will be downloaded by the action and the entrypoint will be executed.

See the [recommendations for versioning and releasing actions][version].

Publishing to the marketplace is straightforward - cut a release, and check the box for publishing to marketplace - note that the readme of the repository becomes the main page for your action in the marketplace.

# The Kind GitHub Action

![](/img/article-photos/building-github-actions/marketplace.PNG)

This article is a result of my experimenting on how to build a custom action for Kind - you can [use the action in your pipeline right now][kind] to create a local Kubernetes cluster:

```
jobs:
  kind:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@master
    - uses: engineerd/setup-kind@v0.1.0
    - name: Testing
      run: |
        export KUBECONFIG="$(kind get kubeconfig-path)"
        kubectl cluster-info
```

Right now you can specify a Kind config file in your repository, select the Kind version you want to install, together with all flags you can pass to `kind create cluster`:

```
Creating cluster "kind" ...
 ✓ Ensuring node image (kindest/node:v1.15.3) 🖼
 ✓ Preparing nodes 📦📦📦📦📦📦📦
 ✓ Configuring the external load balancer ⚖️
 ✓ Creating kubeadm config 📜
 ✓ Starting control-plane 🕹️
 ✓ Installing CNI 🔌
 ✓ Installing StorageClass 💾
 ✓ Joining more control-plane nodes 🎮
 ✓ Joining worker nodes 🚜
 ✓ Waiting ≤ 5m0s for control-plane = Ready ⏳
Cluster creation complete. 

Kubernetes master is running at https://127.0.0.1:44867
KubeDNS is running at https://127.0.0.1:44867/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

$ kubectl get nodes
NAME                  STATUS     ROLES    AGE     VERSION
kind-control-plane    Ready      master   2m42s   v1.15.3
kind-control-plane2   Ready      master   2m11s   v1.15.3
kind-control-plane3   Ready      master   65s     v1.15.3
kind-worker           NotReady   <none>   28s     v1.15.3
kind-worker2          NotReady   <none>   28s     v1.15.3
kind-worker3          NotReady   <none>   28s     v1.15.3
```
> When creating multi-node clusters, make sure you wait for the nodes to become available - this is still a work in progress that will be fixed in future versions.

# Conclusions

Writing your own custom action is fairly straightforward, and I expect the process to become even more streamlined (particularly around versioning and publishing). Be sure to check out the Kind action - you can [find the repository here][engineerd-repo].

Thanks for reading!

[acquisition]: https://news.microsoft.com/2018/06/04/microsoft-to-acquire-github-for-7-5-billion/
[actions-announcement]: https://github.blog/2019-08-08-github-actions-now-supports-ci-cd/
[syntax]: https://help.github.com/en/articles/workflow-syntax-for-github-actions
[software]: https://help.github.com/en/articles/software-in-virtual-environments-for-github-actions
[actions]: https://github.com/actions
[node]: https://github.com/actions/setup-node
[py]: https://github.com/actions/setup-python
[java]: https://github.com/actions/setup-java
[go]: https://github.com/actions/setup-go
[version]: https://github.com/actions/toolkit/blob/master/docs/action-versioning.md#versioning
[toolkit]: https://github.com/actions/toolkit
[types]: https://github.com/actions/toolkit/blob/master/docs/action-types.md
[docker-action]: https://github.com/actions/toolkit/blob/master/docs/container-action.md
[article]: https://radu-matei.com/blog/kubernetes-e2e-github-actions/
[template-repos]: https://github.blog/2019-06-06-generate-new-repositories-with-repository-templates/
[inputs]: https://github.com/actions/toolkit/blob/28803fc3b4374bf36e8878e38876d607b8b7107a/packages/core/src/core.ts#L61-L76
[env]: https://help.github.com/en/articles/virtual-environments-for-github-actions
[action-test]: https://github.com/engineerd/setup-kind/blob/73ab115c7fd3b00f032ae89c8ac65e6f136af581/test/action.ts
[version]: https://github.com/actions/toolkit/blob/master/docs/action-versioning.md#recommendations

[kind]: https://github.com/marketplace/actions/kind-kubernetes-in-docker-action
[engineerd-repo]: https://github.com/engineerd/setup-kind