#version 300 es

#define MAX_LIGHTS 17

in vec4 a_position;
in vec3 a_normal;
in vec4 a_color;

// Scene uniforms
uniform vec3 u_viewWorldPosition;
uniform vec4 u_ambientLight;

// Multiple lights
uniform int u_numLights;
uniform vec3 u_lightPositions[MAX_LIGHTS];
uniform vec4 u_lightColors[MAX_LIGHTS];
uniform float u_lightIntensities[MAX_LIGHTS];

// Model uniforms
uniform mat4 u_world;
uniform mat4 u_worldInverseTransform;
uniform mat4 u_worldViewProjection;

// Material uniforms
uniform vec4 u_ambientColor;
uniform vec4 u_diffuseColor;
uniform vec4 u_specularColor;
uniform float u_shininess;
uniform bool u_useVertexColor;

// Output to fragment shader (pre-calculated lighting)
out vec4 v_lighting;

void main() {
    gl_Position = u_worldViewProjection * a_position;

    // Transform normal and get world position
    vec3 normal = normalize(mat3(u_worldInverseTransform) * a_normal);
    vec3 surfaceWorldPosition = (u_world * a_position).xyz;
    vec3 surfToViewDir = normalize(u_viewWorldPosition - surfaceWorldPosition);

    // Choose material color
    vec4 materialDiffuse = u_useVertexColor ? a_color : u_diffuseColor;

    // Start with ambient
    v_lighting = u_ambientColor * u_ambientLight;

    // Calculate all lights in vertex shader
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= u_numLights) break;

        vec3 surfToLightDir = normalize(u_lightPositions[i] - surfaceWorldPosition);

        // Diffuse
        float diff = max(dot(normal, surfToLightDir), 0.0);

        // Specular (only if diffuse > 0)
        float spec = 0.0;
        if (diff > 0.0) {
            vec3 reflectDir = reflect(-surfToLightDir, normal);
            spec = pow(max(dot(surfToViewDir, reflectDir), 0.0), u_shininess);
        }

        // Add light contribution
        float intensity = u_lightIntensities[i];
        v_lighting += intensity * diff * materialDiffuse * u_lightColors[i];
        v_lighting += intensity * spec * u_specularColor * u_lightColors[i];
    }
}
