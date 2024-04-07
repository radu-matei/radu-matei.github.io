<div align="center"> 
<h1>stylelint-config-one<br/>🛏</h1>

All-in-one stylelint config.

[![npm](https://img.shields.io/npm/v/stylelint-config-one.svg?style=flat-square)](https://www.npmjs.com/package/stylelint-config-one)
[![npm](https://img.shields.io/npm/dt/stylelint-config-one?style=flat-square)](https://www.npmtrends.com/stylelint-config-one)
[![GitHub](https://img.shields.io/github/license/nanxiaobei/stylelint-config-one?style=flat-square)](https://github.com/nanxiaobei/stylelint-config-one/blob/main/LICENSE)

</div>

---

## Install

```bash
pnpm add stylelint-config-one
# or
yarn add stylelint-config-one
# or
npm install stylelint-config-one
```

## Usage

You can choose one to extend in your `.stylelintrc`, based on your project style solution:

### CSS

```json
{
  "extends": "stylelint-config-one"
}
```

or

```json
{
  "extends": "stylelint-config-one/css"
}
```

### SCSS

```json
{
  "extends": "stylelint-config-one/scss"
}
```

### CSS with CSS Modules

```json
{
  "extends": "stylelint-config-one/css-modules"
}
```

### SCSS with CSS Modules

```json
{
  "extends": "stylelint-config-one/scss-modules"
}
```
