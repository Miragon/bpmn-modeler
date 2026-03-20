# Translation File Template

Every translation file in this project follows this exact structure.

## License Header

```typescript
/**
 * Copyright 2025 Miragon GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
```

## Translation File (e.g., bpmn-js.ts)

```typescript
/**
 * This file contains the strings used in the bpmn-js module.
 */
const translations: Record<string, string> = {
    "English key": "Translated value",
    "Another key with {param}": "Translated with {param}",
};

export default translations;
```

**File-specific doc comments:**
- `bpmn-js.ts`: `This file contains the strings used in the bpmn-js module.`
- `dmn-js.ts`: `This file contains the translated strings used in the dmn-js component.`
- `properties-panel.ts`: `This file contains the translations used by the bpmn-js-properties-panel component.`
- `other.ts`: `This file contains translations that were used in other components.`

## Barrel File (e.g., `<locale>/index.ts`)

```typescript
import bpmnJs from "./bpmn-js";
import dmnJs from "./dmn-js";
import propertiesPanel from "./properties-panel";
import other from "./other";

/** Merged translation dictionary for this locale. */
const dictionary: Record<string, string> = {
    ...bpmnJs,
    ...dmnJs,
    ...propertiesPanel,
    ...other,
};

export default dictionary;
```

No license header needed on barrel files — they just re-export.

## Formatting Rules

- Use double quotes for all strings (TypeScript convention in this project)
- Trailing comma on every key-value pair
- 4-space indentation inside the const object
- End file with `export default translations;` (translation files) or `export default dictionary;` (barrel)
- Keys must be in the same order as the English (en) source files
- Variable name is always `translations` in translation files, `dictionary` in barrel files
