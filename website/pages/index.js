/**
 * Copyright (c) 2017-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from "react";
import classnames from "classnames";
import Link from "@docusaurus/Link";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import withBaseUrl from "@docusaurus/withBaseUrl";

import Layout from "@theme/Layout";

import styles from "./styles.module.css";

function Button({ to, children }) {
  return (
    <Link to={to} className="button button--outline button--primary button--lg">
      {children}
    </Link>
  );
}

function Hero() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;
  return (
    <header className={classnames("hero", styles.hero)}>
      <div
        className={styles.background}
        style={{ backgroundImage: `url(${withBaseUrl("img/smpte.svg")})` }}
      />
      <div className="container">
        <img src={withBaseUrl("img/logo.svg")} alt="logo" />
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <Button to={withBaseUrl("docs/quickstart")}>Get Started</Button>
      </div>
    </header>
  );
}

function Feature({ title, children, color = "white" }) {
  return (
    <div className="col">
      <h2 className="text--center" style={{ color }}>
        {title}
      </h2>
      <p className="text--justify">{children}</p>
    </div>
  );
}

function Body() {
  return (
    <main className="container padding-horiz--md margin-vert--xl">
      <div className="row">
        <h1>👷‍♀️THESE DOCS ARE  UNDER CONSTRUCTION 👷‍♂️</h1>
      </div>
      <div className="row">
        <Feature title="Convenient" color="#00ABAA">
          The Channel class provides a promise-fluent API for creating async
          iterators. The same constructor can be used to convert event emitters,
          streams, websockets, web workers, observers, observables or any other
          callback-based data source into a format which can be read using{" "}
          <code>async/await</code> and <code>for await…of</code>
          statements.
        </Feature>
        <Feature title="Safe" color="#BA00AC">
          Channels prevent common mistakes developers make when rolling async
          iterators by hand. By initializing lazily, providing strategies for
          dealing with backpressure, and propagating errors in a predictable
          fashion, channels ensure that event handlers are cleaned up and help
          you quickly locate bottlenecks and deadlocks.
        </Feature>
        <Feature title="Powerful" color="#00B100">
          The Channel constructor is well-specified and flexible enough to model
          complex patterns like cancelable timers, async semaphores, and generic
          pubsub classes. The Channel class also provides static combinator
          methods like <code>Channel.race</code> and <code>Channel.merge</code>{" "}
          which allow you to use async iterators for reactive programming
          purposes.
        </Feature>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Layout>
      <Hero />
      <Body />
    </Layout>
  );
}
