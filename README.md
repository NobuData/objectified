# Objectified Platform

Objectified is an OpenAPI 3.1.0 Specification Application that provides a visual editor for creating and editing Schema Objects and Properties.

This top-level project is the base.  Objectified is a monorepo, meaning, each submodule may or may not have its own README file.

## Framework

Objectified is written using React, NextJS, FastAPI, and PostgreSQL.

## Goals

Objectified is a constant work in progress.

The goals of the project are defined in [issues](https://github.com/NobuData/objectified/issues).

## Story

This is the 5th iteration of the project, effectively started in 2001 with Webplasm (now defunct.)

Webplasm was initially a web application framework (similar to React or Angular) that started with an XML-based processing language that mimicked
functionality provided by ColdFusion at the time.

As the application evolved, a need for a database with the ability to dynamically create database schemas of varying types arised.  Out of this,
the first version of what would be Objectified was born.  JSON was not invented at the time, but MySQL and PostgreSQL were, so these were the
natural choices due to referential integrity guarantees.

What this application eventually evolved into is a visual editor to shape your data, along with storing instances of that data (eventually).  Data 
can be dynamically shaped and reshaped as needed, stored in both PostgreSQL and MongoDB databases for consistency.

This is a passion project that is over 20 years in the making.

# Roadmap

... Coming soon.  See [issues](https://github.com/NobuData/objectified/issues) for immediate gratification.

# License

Objectified is officially Apache 2.0 Licensed.  [See here](/LICENSE).

# Contributing

Contributions are greatly appreciated  Issues are also greatly appreciated.

All project versions follow [semantic versioning](https://semver.org/).  You must do the same.

## AI-Assisted Contributions

We recommend using GPT-5.2 or better for planning.  We recommend using Claude Sonnet 4.6 for code generation, and
Claude Opus 4.6 for UI/UX design improvements.
