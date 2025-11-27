#version 300 es
precision highp float;


in vec4 v_lighting;

out vec4 outColor;

void main() {
    outColor = v_lighting;
}
