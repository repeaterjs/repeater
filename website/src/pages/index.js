import React from "react";
import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import withBaseUrl from "@docusaurus/withBaseUrl";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";

function Hero() {
  const context = useDocusaurusContext();
  const { siteConfig = {} } = context;
  return (
    <header className="hero">
      <div className="container margin-vert--lg">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <Link
          to={withBaseUrl("docs/quickstart")}
          className="button button--primary button--outline button--lg"
        >
          Get Started
        </Link>
        <div className="button button--link">
          <iframe
            src="https://ghbtns.com/github-btn.html?user=repeaterjs&repo=repeater&type=star&count=true&size=large"
            frameBorder="0"
            scrolling="0"
            width="160px"
            height="30px"
          ></iframe>
        </div>
      </div>
    </header>
  );
}

function Feature({ title, children, color = "primary" }) {
  const h2 = "text";
  return (
    <div className="col">
      <h2 className={"text--center text--" + color} style={{ color }}>
        {title}
      </h2>
      <p className="text--justify">{children}</p>
    </div>
  );
}

function Body() {
  return (
    <main className="container">
      <div className="row margin-vert--xl">
        <Feature title="Convenient">
          The <code>Repeater</code> class provides a memorable promise-based API
          for creating async iterators. You can reuse the same constructor to
          convert event targets, websockets or any other callback-based data
          source into a format which can be read using <code>async/await</code>{" "}
          and <code>for await…of</code> syntax.
        </Feature>
        <Feature title="Safe" color="#BA00AC">
          Repeaters prevent common mistakes people make when rolling async
          iterators by hand. By executing lazily, dealing with backpressure, and
          propagating errors in a predictable manner, repeaters ensure that
          event handlers are cleaned up and that bottlenecks and deadlocks are
          discovered quickly.
        </Feature>
        <Feature title="Powerful" color="#00B100">
          You can use repeaters to implement architectural patterns like
          cancelable timers, semaphores, and generic pubsub classes. The
          Repeater class also defines static methods like{" "}
          <code>Repeater.race</code> and <code>Repeater.merge</code> which allow
          you to use async iterators for reactive programming purposes.
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
