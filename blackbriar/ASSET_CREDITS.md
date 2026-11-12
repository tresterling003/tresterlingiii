# Asset credits
| Asset | Source | Author / license | Use and changes |
|---|---|---|---|
| Body mesh "Michelle" (`assets/body.json`) | three.js examples, `examples/models/gltf/Michelle.glb` (r170) | Adobe Mixamo character. Mixamo terms allow use in projects; **not re-verified in this session** (no network access to Adobe). Do not redistribute as a standalone asset. | Re-packed as base64 JSON; skeleton stretched at runtime; texture desaturated/tinted (Monitor uniform, coworkers). |
| Idle/Walk/Run animation (`assets/anims.json`) | three.js examples, `Soldier.glb` (r170) | Adobe Mixamo animations; same note as above. | Quaternion tracks only, exported to JSON. |
| Head scan (`assets/head.json`, `head_normal.jpg`) | three.js examples, `gltf/LeePerrySmith` (r170) | Lee Perry-Smith / Infinite Realities, CC BY 3.0 (as documented with the three.js examples; not re-verified this session). | Neck cropped; sunken eyes/cheeks and jaw morph added in code; normal map resized to 1024². |
| three.js r170 | cdn.jsdelivr.net/npm/three@0.170.0 | MIT | Unmodified. |
| ws 8.18.3 | npm | MIT | Unmodified. |
Everything else (all textures, environment geometry, props, tool models, audio) is generated in code in this repository.
**Known licensing gap:** the Monitor is built from a Mixamo body. Prototype art only; replace with a commissioned or properly licensed creature before any release.
