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
