import React from "react";
import classnames from "classnames";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import withBaseUrl from "@docusaurus/withBaseUrl";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";

function Hero() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;
  return (
    <header className={classnames("hero")}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <Link
          to={withBaseUrl("docs/quickstart")}
          className="button button--outline button--primary button--lg"
        >
          Get Started
        </Link>
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
        <Feature title="Convenient" color="#00ABAA">
          The Repeater class provides a promise-fluent API for creating async
          iterators. You can reuse the same constructor to convert event
          emitters, streams, websockets, or any other callback-based data source
          into a format which can be read using <code>async/await</code> and{" "}
          <code>for await…of</code> statements.
        </Feature>
        <Feature title="Safe" color="#BA00AC">
          Repeaters prevent common mistakes people make when rolling async
          iterators by hand. By executing lazily, dealing with backpressure, and
          propagating errors in a predictable manner, repeaters ensure that event
          listeners are cleaned up and that bottlenecks and deadlocks are
          discovered quickly.
        </Feature>
        <Feature title="Powerful" color="#00B100">
          You can use repeaters to implement architectural patterns like
          cancelable timers, semaphores, and generic pubsub classes. The Repeater
          class also defines static methods like <code>Repeater.race</code> and{" "}
          <code>Repeater.merge</code> which allow you to use async iterators for
          reactive programming purposes.
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
