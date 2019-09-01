+++
author = "Radu Matei"
categories = ["web"]
date = "2019-09-01"
description = "How I added a dark theme toggle to my Hugo website without writing a single line of CSS"
linktitle = ""
title = "Adding dark mode to a Hugo static website without learning CSS"
type = "post"
featured = "dark.gif"
featuredpath = "/img/article-photos/dark-mode/"
images = ["/img/article-photos/dark-mode/dark.gif"]
summary = "How I added a dark theme toggle to my Hugo website without writing a single line of CSS"
+++

# Introduction

Everyone seems to be adding dark themes to their platforms these days. Recently, [Microsoft even released a trailer for the future dark mode][msft-dark] - an actual video trailer, produced to showcase a theme.

My blog, based on the [Hugo Future Imperfect theme][future-imperfect], has a strikingly light theme - which makes it extremely difficult to read at night. But because my front-end skills are completely non-existent (no, really!), creating a dark theme stylesheet for my website was out of the question.
So I wanted to cheat my way into adding a dark mode, but without putting in the effort of actually learning CSS.

# Generating a dark mode theme

Recently, I've started using the [Dark Mode Extension][extension] for my browser, particularly during the night - and while it is not ideal, and lots of sites require their own custom-made dark theme ([looking at you, GitHub!][github-dark]), it works well enough not to destroy my eyes when I read StackOverflow answers in the middle of the night.

Additionally, the extension also allows you to select your preferred style for the dark theme. I never bothered to understand how the extension worked before discovering this setting. I also never learned CSS, and while I understand the basic way it works, the sheer complexity of themes today is daunting. But as it turns out, whenever you activate the dark mode for a website, the stylesheet you selected gets injected in the page.

So I tried all the themes the extension comes with, and found out that _Dark invert #5_ was the style I liked best.

> The actual CSS file is located in the browser extension data directory - you can find it by inspecting a web page when the extension is active, and for Chromium-based browsers, you can access it from the at a URL that resembles:
>```bash
chrome-extension://<some-generated-directory>/data/content_script/general/dark_25.css
```

After looking at the theme style, this is the entire CSS content injected by the extension - it changes the background color, inverts colors, adjusts brightness, colours, hue:

```css
html {
    background-color: #171717 !important;
}
html {
    filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(85%);
    -webkit-filter: invert(100%) hue-rotate(180deg) brightness(105%) contrast(85%);
}
body {
    background-color: #FFF !important;
}
img,
video,
body * [style*="background-image"] {
    filter: hue-rotate(180deg) contrast(100%) invert(100%);
    -webkit-filter: hue-rotate(180deg) contrast(100%) invert(100%);
}
```

So I saved this file along with the other CSS files in my theme, referenced it in the header of my HTML pages, but disabled it by default (because I still want light mode by default):

```
<link disabled id="dark-mode-theme" rel="stylesheet" href="/css/dark.css">
```

Now that I have a style, it's time to add a way of toggling between light and dark modes.

# Toggling between the light and dark modes

My theme comes with a navigation bar that is always visible at the top. In the top right, there is a button that opens the sharing menu, one for search, and another for a menu. That portion seemed perfect to add another button, since it's always in view.

My theme also comes with [Font Awesome][font-awesome] - and if you search, you can find icons for a moon and a sun - and we'll use them to toggle between dark and light modes. Because I want light mode by default, I added the moon icon in the navigation bar to toggle to dark mode:

```
<a id="dark-mode-toggle" class="fal fa-moon-o">Toggle Dark Mode</a>
```

Now we need a bit of JavaScript to add an event listener, so that when the moon icon is pressed, the dark mode is toggled:

```
var toggle = document.getElementById("dark-mode-toggle");
var darkTheme = document.getElementById("dark-mode-theme");

toggle.addEventListener("click", () => {
    if (toggle.className === "fal fa-moon-o") {
        setTheme("dark");
    } else if (toggle.className === "fal fa-sun-o") {
        setTheme("light");
    }
});

function setTheme(mode) {
    if (mode === "dark") {
        darkTheme.disabled = false;
        toggle.className = "fal fa-sun-o";
    } else if (mode === "light") {
        darkTheme.disabled = true;
        toggle.className = "fal fa-moon-o";
    }
}
```

So when the icon is pressed, the style sheet is enabled or disabled, and the correct icon is set.

# Using local storage for persistance

This works well enough, but if you navigate to another page in the website, the default theme (light, in my case) is re-applied. Let's see how we can use local storage to save the preference for the theme - and just save the theme in local storage when the user changes it:

```
// the default theme is light
var savedTheme = localStorage.getItem("dark-mode-storage") || "light";
setTheme(savedTheme);

function setTheme(mode) {
    localStorage.setItem("dark-mode-storage", mode);

    // same as above
}
```

# Conclusion

I managed to add a dark mode to my blog and persist the preference in local storage - all without writing a single line of CSS. It's not perfect, and it needs plenty of more work (for example, images are inverted in an iframe), but I'm happy with the progress I made without much effort.

Thanks for reading :)

[future-imperfect]: https://themes.gohugo.io/future-imperfect/
[extension]: https://mybrowseraddon.com/dark-mode.html
[github-dark]: https://github.com/StylishThemes/Github-Dark
[font-awesome]: https://fontawesome.com/
[msft-dark]: https://twitter.com/Microsoft365/status/1166742433134186497