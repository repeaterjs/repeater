import { jsx } from "@b9g/crank/standalone";
import { Root } from "../components/root.js";

interface ViewProps {
  url: string;
  params: Record<string, string>;
}

export default function Home({ url }: ViewProps) {
  return jsx`
    <${Root}
      title="Repeater.js — The missing constructor for creating safe async iterators"
      description="The missing constructor for creating safe async iterators."
      url=${url}
    >
      <section class="hero">
        <h1>Repeater.js</h1>
        <p class="hero-tagline">The missing constructor for creating safe async iterators.</p>
        <div class="hero-actions">
          <a class="button" href="/docs/quickstart/">Get Started</a>
          <a class="button button-ghost" href="https://github.com/repeaterjs/repeater">GitHub</a>
        </div>
        <pre class="hero-install"><code>npm install @repeaterjs/repeater</code></pre>
      </section>

      <section class="features">
        <div class="feature">
          <h2 style="color: var(--accent)">Convenient</h2>
          <p>
            The <code>Repeater</code> class provides a memorable promise-based API
            for creating async iterators. You can reuse the same constructor to
            convert event targets, websockets or any other callback-based data
            source into a format which can be read using <code>async/await</code>
            and <code>for await…of</code> syntax.
          </p>
        </div>
        <div class="feature">
          <h2 style="color: #BA00AC">Safe</h2>
          <p>
            Repeaters prevent common mistakes people make when rolling async
            iterators by hand. By executing lazily, dealing with backpressure, and
            propagating errors in a predictable manner, repeaters ensure that event
            handlers are cleaned up and that bottlenecks and deadlocks are
            discovered quickly.
          </p>
        </div>
        <div class="feature">
          <h2 style="color: #00B100">Powerful</h2>
          <p>
            You can use repeaters to implement architectural patterns like
            cancelable timers, semaphores, and generic pubsub classes. The
            <code>Repeater</code> class also defines static methods like
            <code>Repeater.race</code> and <code>Repeater.merge</code> which allow
            you to use async iterators for reactive programming purposes.
          </p>
        </div>
      </section>
    </${Root}>
  `;
}
