// 工具层纯工具函数（无 DSH 依赖，可独立测试）。

/** 原版标准 JSON Schema 参数 → dsh-tools 扁平参数格式（属性级 required）。 */
export function toFlatParameters(parameters) {
	const props = parameters?.properties || {};
	const required = new Set(Array.isArray(parameters?.required) ? parameters.required : []);
	const flat = {};
	for (const [key, schema] of Object.entries(props)) {
		if (!schema || typeof schema !== "object") continue;
		flat[key] = toDshSchema(schema, required.has(key));
	}
	return flat;
}

function toDshSchema(schema, isRequired = false) {
	const converted = {
		...(schema.type ? { type: schema.type } : {}),
		...(Array.isArray(schema.enum) ? { enum: schema.enum } : {}),
		...(schema.description ? { description: schema.description } : {}),
		...(isRequired ? { required: true } : {}),
	};
	if (schema.items) converted.items = toDshSchema(schema.items);
	if (schema.type === "object" || schema.properties) {
		const nestedRequired = new Set(Array.isArray(schema.required) ? schema.required : []);
		converted.properties = Object.fromEntries(
			Object.entries(schema.properties || {}).map(([key, value]) => [
				key,
				toDshSchema(value, nestedRequired.has(key)),
			]),
		);
		converted.additionalProperties = typeof schema.additionalProperties === "boolean"
			? schema.additionalProperties
			: true;
	}
	return converted;
}

/** 把原版 textResult（content blocks）转为 DSH 友好的 { text, ...details }。 */
export function toDsResult(result) {
	if (result && Array.isArray(result.content) && result.content[0]?.type === "text") {
		return { text: String(result.content[0].text), ...(result.details || {}) };
	}
	return result;
}
