/*
 * Script to read a model stored in Wavefront OBJ format
 *
 * Gilberto Echeverria
 * 2025-07-29
 */


'use strict';

// Cache for preloaded models (VAO data)
const modelCache = new Map();

// Per-model material storage to avoid conflicts
let currentMaterials = {};
let materialInUse = undefined;

/*
 * Extract the elements in a face as encoded in an OBJ file
 * As faces are read, pass the information into the array that will be used
 * to draw the object in WebGL
 */
function parseFace(parts, objData, arrays) {
    // This will produce an array of arrays
    // Each arrays corresponds has the vertices
    // Each vertex is an array with its vertex, texture and normal indices
    let faceVerts = parts.slice(1).map(face => face.split('/'));
    faceVerts.forEach(vert => {
        const vertex = vert != '' ? Number(vert) : undefined
        if (vertex != undefined) {
            // console.log(objData.vertices[vert[0]])

            // First element is the vertex index
            arrays.a_position.data.push(...objData.vertices[vert[0]]);
            // Second element is the texture index
            if (vert.length > 1 && vert[1] != "") {
                arrays.a_texCoord.data.push(...objData.textures[vert[1]]);
            }
            // Third element is the normal index
            if (vert.length > 2 && vert[2] != "") {
                arrays.a_normal.data.push(...objData.normals[vert[2]]);
            }

            if (materialInUse) {
                arrays.a_color.data.push(...materialInUse['Kd'], 1);
            } else {
                // Force a color for each vertex
                arrays.a_color.data.push(0.4, 0.4, 0.4, 1);
            }
            // This is not really necessary, but just in case
            objData.faces.push({v: vert[0], t: vert[1], n: vert[2]});
        }
    });
}

/*
 * Read the contents of an OBJ file received as a string
 * Return an object called arrays, with the arrays necessary to build a
 * Vertex Array Object (VAO) for WebGL.
 */
function loadObj(objString) {

    // Initialize a dummy item in the lists as index 0
    // This will make it easier to handle indices starting at 1 as used by OBJ
    let objData = {
        vertices: [ [0, 0, 0] ],
        normals: [ [0, 0, 0] ],
        textures: [ [0, 0, 0] ],
        faces: [ ],
    };

    // The array with the attributes that will be passed to WebGL
    let arrays = {
        a_position: {
            numComponents: 3,
            data: [ ]
        },
        a_color: {
            numComponents: 4,
            data: [ ]
        },
        a_normal: {
            numComponents: 3,
            data: [ ]
        },
        a_texCoord: {
            numComponents: 2,
            data: [ ]
        }
    };

    let partInfo;
    let lines = objString.split('\n');
    lines.forEach(line => {
        let parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'v':
                // Ignore the first part (the keyword),
                // remove any empty elements and convert them into a number
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                objData.vertices.push(partInfo);
                break;
            case 'vn':
                partInfo = parts.slice(1).filter(vn => vn != '').map(Number);
                objData.normals.push(partInfo);
                break;
            case 'vt':
                partInfo = parts.slice(1).filter(f => f != '').map(Number);
                objData.textures.push(partInfo);
                break;
            case 'f':
                parseFace(parts, objData, arrays);
                break;
            case 'usemtl':
                if (materials.hasOwnProperty(parts[1])) {
                    materialInUse = materials[parts[1]];
                }
                break;
        }
    });

    //console.log("ATTRIBUTES:")
    //console.log(arrays);

    //console.log("OBJ DATA:")
    //console.log(objData);

    return arrays;
}

/*
 * Read the contents of an MTL file received as a string
 * Return an object containing all the materials described inside,
 * with their illumination attributes.
 */
function loadMtl(mtlString, targetMaterials = null) {
    const materials = targetMaterials || currentMaterials;
    let currentMtl = {};

    let partInfo;
    let lines = mtlString.split('\n');
    lines.forEach(line => {
        let parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'newmtl':
                // Add a new entry into the object
                materials[parts[1]] = {};
                currentMtl = materials[parts[1]];
                break;
            case 'Ns':  // Specular coefficient ("Shininess")
                currentMtl['Ns'] = Number(parts[1]);
                break;
            case 'Ka':  // Ambient color
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                currentMtl['Ka'] = partInfo;
                break;
            case 'Kd':  // Diffuse color
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                currentMtl['Kd'] = partInfo;
                break;
            case 'Ks':  // Specular color
                partInfo = parts.slice(1).filter(v => v != '').map(Number);
                currentMtl['Ks'] = partInfo;
                break;
        }
    });

    return materials;
}

/*
 * Load OBJ with its MTL file, using isolated materials per model
 * Returns arrays ready for VAO creation
 * brightnessMultiplier: multiplies color values (1.0 = original, 1.5 = 50% brighter)
 */
function loadObjWithMtl(objString, mtlString = null, brightnessMultiplier = 1.0) {
    // Create isolated materials for this model
    const modelMaterials = {};

    if (mtlString) {
        loadMtl(mtlString, modelMaterials);
    }

    // Initialize a dummy item in the lists as index 0
    let objData = {
        vertices: [ [0, 0, 0] ],
        normals: [ [0, 0, 0] ],
        textures: [ [0, 0, 0] ],
        faces: [ ],
    };

    let arrays = {
        a_position: { numComponents: 3, data: [ ] },
        a_color: { numComponents: 4, data: [ ] },
        a_normal: { numComponents: 3, data: [ ] },
        a_texCoord: { numComponents: 2, data: [ ] }
    };

    let activeMaterial = null;

    let lines = objString.split('\n');
    lines.forEach(line => {
        let parts = line.split(/\s+/);
        switch (parts[0]) {
            case 'v':
                let vertInfo = parts.slice(1).filter(v => v != '').map(Number);
                objData.vertices.push(vertInfo);
                break;
            case 'vn':
                let normInfo = parts.slice(1).filter(vn => vn != '').map(Number);
                objData.normals.push(normInfo);
                break;
            case 'vt':
                let texInfo = parts.slice(1).filter(f => f != '').map(Number);
                objData.textures.push(texInfo);
                break;
            case 'f':
                // Parse face with current material
                let faceVerts = parts.slice(1).map(face => face.split('/'));
                faceVerts.forEach(vert => {
                    const vertex = vert[0] != '' ? Number(vert[0]) : undefined;
                    if (vertex != undefined) {
                        arrays.a_position.data.push(...objData.vertices[vert[0]]);

                        if (vert.length > 1 && vert[1] != "") {
                            arrays.a_texCoord.data.push(...objData.textures[vert[1]]);
                        }
                        if (vert.length > 2 && vert[2] != "") {
                            arrays.a_normal.data.push(...objData.normals[vert[2]]);
                        }

                        // Apply material color with brightness multiplier (preserves color ratios)
                        if (activeMaterial && activeMaterial['Kd']) {
                            const kd = activeMaterial['Kd'];
                            const r = Math.min(1.0, kd[0] * brightnessMultiplier);
                            const g = Math.min(1.0, kd[1] * brightnessMultiplier);
                            const b = Math.min(1.0, kd[2] * brightnessMultiplier);
                            arrays.a_color.data.push(r, g, b, 1);
                        } else {
                            arrays.a_color.data.push(0.6, 0.6, 0.6, 1);
                        }

                        objData.faces.push({v: vert[0], t: vert[1], n: vert[2]});
                    }
                });
                break;
            case 'usemtl':
                if (modelMaterials.hasOwnProperty(parts[1])) {
                    activeMaterial = modelMaterials[parts[1]];
                }
                break;
        }
    });

    return arrays;
}

/*
 * Preload model and cache its VAO data
 */
async function preloadModel(gl, programInfo, basePath, modelName, brightnessBoost = 0.3) {
    const cacheKey = `${modelName}_${brightnessBoost}`;

    if (modelCache.has(cacheKey)) {
        return modelCache.get(cacheKey);
    }

    try {
        // Load OBJ file
        const objResponse = await fetch(`${basePath}${modelName}.obj`);
        if (!objResponse.ok) {
            console.error(`Error loading ${modelName}.obj`);
            return null;
        }
        const objText = await objResponse.text();

        // Try to load MTL file
        let mtlText = null;
        try {
            const mtlResponse = await fetch(`${basePath}${modelName}.mtl`);
            if (mtlResponse.ok) {
                mtlText = await mtlResponse.text();
            }
        } catch (e) {
            console.warn(`No MTL file for ${modelName}`);
        }

        // Parse and create buffers
        const arrays = loadObjWithMtl(objText, mtlText, brightnessBoost);
        const twgl = await import('twgl-base.js');
        const bufferInfo = twgl.createBufferInfoFromArrays(gl, arrays);
        const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);

        const cachedModel = { arrays, bufferInfo, vao };
        modelCache.set(cacheKey, cachedModel);

        console.log(`✅ Model preloaded: ${modelName}`);
        return cachedModel;
    } catch (error) {
        console.error(`Error preloading ${modelName}:`, error);
        return null;
    }
}

/*
 * Get cached model (must be preloaded first)
 */
function getCachedModel(modelName, brightnessBoost = 0.3) {
    const cacheKey = `${modelName}_${brightnessBoost}`;
    return modelCache.get(cacheKey) || null;
}

export { loadObj, loadMtl, loadObjWithMtl, preloadModel, getCachedModel, modelCache };
