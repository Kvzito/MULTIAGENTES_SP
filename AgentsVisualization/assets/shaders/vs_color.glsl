#version 300 es
in vec4 a_position;
in vec4 a_color;

uniform mat4 u_transforms;
uniform vec4 u_color;

out vec4 v_color;

void main() {
    gl_Position = u_transforms * a_position;
    // Use uniform color if provided, otherwise use vertex color
    v_color = u_color.a > 0.0 ? u_color : a_color;
}
