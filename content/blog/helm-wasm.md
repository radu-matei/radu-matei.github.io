+++
author = "Radu Matei"
tags = ["golang", "wasm", "helm"]
date = "2019-05-11"
description = ""
linktitle = ""
title = "Rendering Helm templates in the browser, with WebAssembly"
# type = "post"
summary = ""
featured = "helm-wasm.png"
featuredpath = "/img/article-photos/helm-wasm/"
images = ["/img/article-photos/helm-wasm/helm-wasm.png"]
image = "/img/article-photos/helm-wasm/helm-wasm.png"
+++

I've been trying to find a weekend to play around with Web Assembly for at least
a couple of months now - I had previously read the _hello world_ examples for
both Go and Rust, but never had the time to actually try things out. So I
decided to take a piece of real world Go code, that is used today in Helm, and
see if I can get it to execute in the browser - I chose to replicate a simpler
version of `helm template`, where you input the template, values file, and
metadata in the web page, and the rendered template gets printed out.

This should _absolutely not_ be used for any serious purpose, since you are
about to see some glued pieces of software that happen to work. Now that we have
that out of the way, let see _how_ this works.

### Interacting with the DOM from Go

The first thing you learn in JavaScript after the slight amusement of `alert` is
gone, is to manipulate the DOM - you are able select elements by their ID or
class, then read and write their values. This can be done in Go with Web
Assembly using the `sycall/js` package, and the syntax is really similar to
JavaScript:

```
someValue := document.Call("getElementById", "someId").Get("value").String()
```

This is equivalent to the following in JavaScript (and modifying the value of
objects can be done in a similar way):

```
var someValue = document.getElementById("someId").value
```

So in theory, we have the inputs and outputs for our simple application - we can
read the chart metadata, templates, and values files from a bunch of HTML text
areas, and we can write the output to another text area. (Luckily enough, the
only other HTML element we are using is a button - ideal, since that's pretty
much all I can do on the front-end.)

Now we need to actually render the Helm templates, and this is the part I wasn't
sure that was even going to compile with Web Assembly - we're directly importing
packages from `k8s.io/helm` into our application, as well as the library for
unmarshaling YAML, then calling the Helm render engine:

```
func render(this js.Value, args []js.Value) interface{} {
	document := js.Global().Get("document")
	metadata := document.Call("getElementById", "metadata").Get("value").String()
	templates := document.Call("getElementById", "templates").Get("value").String()
	values := document.Call("getElementById", "values").Get("value").String()

    m := &chart.Metadata{}
    // unmarshaling the chart metadata, coming from the HTML input
	err := yaml.Unmarshal([]byte(metadata), m)
	if err != nil {
		fmt.Printf("cannot unmarshal chart metadata: %v", err)
	}

    t := []*chart.Template{}
    // Helm templates, coming from the HTML input
	t = append(t, &chart.Template{Name: "service.yaml", Data: []byte(templates)})
	c := &chart.Chart{
		Metadata:  m,
		Templates: t,
    }

    // values file, from the HTML input
	config := &chart.Config{Raw: values, Values: map[string]*chart.Value{}}

	renderedTemplates, err := renderutil.Render(c, config, renderOpts)
	if err != nil {
		fmt.Printf("error rendering: %v", err)
	}
	fmt.Printf("rendered: %v", renderedTemplates)

	result := ""
	for _, v := range renderedTemplates {
		result += v
	}

    // showing the result in the browser
	document.Call("getElementById", "result").Set("textContent", result)
	return nil
}
```

The next important piece is registering a function written in Go so it can be
used from JavaScript:

```
js.Global().Set("render", js.FuncOf(render))
```

The only thing to note here is the signature for `render`, which has to be
`func render(this js.Value, args []js.Value) interface{}`, where `this` is the
JavaScript context that calls the Go function, and `args` contains the arguments
the function was called with.

> Complete documentation for the
> [`syscall/js` package](https://godoc.org/syscall/js).

> In this article we're not really using `this` or `args`, but we are directly
> reading the values of HTML elements from the DOM.

> You can
> [find the complete repository for this example on GitHub](https://github.com/radu-matei/helm-template-wasm).

> If you want to
> [get started with Go and Web Assembly, the best resource is from the official Go repository](https://github.com/golang/go/wiki/WebAssembly).

### Building and using the package

In the same way we cross-compile our Go projects for various operating systems
and architectures, we need to compile our package for Web Assembly (in this
example, `wasm/render.go` is the path to the Go file we have above):

`GOARCH=wasm GOOS=js go build -o lib.wasm wasm/render.go`

The output of the compilation is a `lib.wasm` file we will import in our web
application.

> `lib.wasm` needs to be imported in the web application, and the module needs
> to be instantiated - this can be found it `index.html` in the repository, and
> is mostly the standard way of importing and starting a Web Assembly module for
> Go.

Next, we need the text areas and the button:

```
Metadata:
<textarea id="metadata" cols="50" rows="10" charswidth="100"></textarea>
Templates:
<textarea id="templates" cols="50" rows="20" charswidth="100"></textarea>
Values:
<textarea id="values" cols="50" rows="20" charswidth="100"></textarea>

<button onClick="render()" id="renderButton">
  Render
</button>
Result:
<textarea id="result" cols="50" rows="20" charswidth="100"></textarea>
```

The callback for the `renderButton`, `render()`, is precisely the Go function
from above, and will be executed whenever the button is clicked.

Provided we included the `wasm_exec.js` script and used it to fetch the
`lib.wasm` library we just built, then we should be able to test this out - in
the repo for this example there is a simply web server - `go run main.go` will
start listening on port 8080, and accessing `localhost:8080` will serve
`index.html`, which loads `lib.wasm` and registers the `render` function so that
whenever the button is pressed, the Go function gets executed and renders the
Helm templates:

![](/img/article-photos/helm-wasm/helm-wasm.gif)

### Conclusion

In around 40 lines of code I managed to get package from a fairly complex
project written in Go, and execute it in the browser, with Web Assembly. Do I
really understand how it works? Not yet, but this is incredibly exciting, both
from the technical perspective, but just as important, because of all the
possibilities it opens up.

Thanks for reading!
