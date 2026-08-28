import test from "node:test";
import assert from "node:assert/strict";

function makeReact() {
	return {
		createElement(type, props, ...children) {
			return { type, props: props || {}, children };
		},
		useEffect() {},
		useRef(initial) { return { current: initial }; },
		useState(initial) { return [initial, () => {}]; },
	};
}

async function renderOpenOverlay(desktop) {
	const components = new Map();
	const react = makeReact();
	globalThis.window = {
		...(desktop ? { dshDesktop: { minimize() {}, maximize() {}, close() {} } } : {}),
		__ModuleLoader__: {
			load(definition) {
				const client = definition.factory((name) => {
					if (name === "react") return react;
					throw new Error(`Unexpected client dependency: ${name}`);
				});
				client.apply({
					slots: {
						inject(_name, install) { install(); },
						register(definition, component) {
							if (definition.id) components.set(definition.id, component);
							return () => {};
						},
					},
				});
			},
		},
	};

	await import(`../lib/client.js?desktop=${desktop}&run=${Date.now()}-${Math.random()}`);
	const Entry = components.get("hana-research-entry");
	const Overlay = components.get("hana-research-overlay");
	assert.ok(Entry && Overlay, "client registers entry and overlay components");
	Entry().props.onClick();
	const root = Overlay();
	assert.ok(root, "entry opens the research overlay");
	return root.children[0];
}

test("desktop overlay toolbar avoids Harness drag and caption regions", async () => {
	const toolbar = await renderOpenOverlay(true);
	assert.equal(toolbar.props.style.padding, "8px 152px 8px 182px");
});

test("browser overlay toolbar keeps compact spacing", async () => {
	const toolbar = await renderOpenOverlay(false);
	assert.equal(toolbar.props.style.padding, "8px 14px");
});

test("agent handoff bridge resolves the current session input actions and acknowledges writes", async () => {
	const registrations = new Map();
	const listeners = new Map();
	const drafts = [];
	const acknowledgements = [];
	const shell = { actions: { setDraft(value) { drafts.push(value); } } };
	const scoped = { id: "session-1" };
	const react = {
		...makeReact(),
		useEffect(effect) { effect(); },
	};
	globalThis.document = { querySelector() { return null; } };
	globalThis.window = {
		location: { origin: "http://127.0.0.1:6857" },
		requestAnimationFrame(callback) { callback(); },
		setTimeout() { return 1; },
		clearTimeout() {},
		addEventListener(type, listener) { listeners.set(type, listener); },
		removeEventListener(type, listener) {
			if (listeners.get(type) === listener) listeners.delete(type);
		},
		__ModuleLoader__: {
			load(definition) {
				const client = definition.factory((name) => {
					if (name === "react") return react;
					throw new Error(`Unexpected client dependency: ${name}`);
				});
				client.apply({
					get(name) {
						if (name === "sessions") return { scope(id) { assert.equal(id, "session-1"); return scoped; } };
						if (name === "conversation") return { input: { for(value) { assert.equal(value, scoped); return shell; } } };
						return null;
					},
					slots: {
						inject(_name, install) { install(); },
						register(options, component) {
							if (options.id) registrations.set(options.id, { options, component });
							return () => {};
						},
					},
				});
			},
		},
	};

	await import(`../lib/client.js?handoff=${Date.now()}-${Math.random()}`);
	const bridge = registrations.get("hana-research-agent-bridge");
	assert.ok(bridge, "client registers the Agent handoff bridge");
	assert.equal(bridge.options.name, "conversation.input.dock");
	const injected = bridge.options.inject("session-1");
	assert.equal(injected.inputActions, shell.actions);
	bridge.component({ input: { draft: "已有草稿" }, ...injected });

	listeners.get("message")({
		origin: window.location.origin,
		data: { type: "hana-research.agent-handoff", requestId: "req-1", prompt: "阅读上下文" },
		source: { postMessage(message, origin) { acknowledgements.push({ message, origin }); } },
	});
	assert.deepEqual(drafts, ["已有草稿\n\n阅读上下文"]);
	assert.equal(acknowledgements[0].origin, window.location.origin);
	assert.deepEqual(acknowledgements[0].message, {
		type: "hana-research.agent-handoff-ack",
		requestId: "req-1",
		ok: true,
	});
});
