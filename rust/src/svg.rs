//! SVG generation - a byte-for-byte port of the template literal in
//! src/app/goal/route.ts. Every newline, indent and number formatting rule is
//! deliberate; do not "clean up" whitespace here or golden tests will fail.

use crate::jsnum::{js_round, js_to_fixed_1, js_to_string};

/// All request parameters the generator needs, already parsed with JS
/// semantics (NaN-preserving).
#[derive(Debug, Clone)]
pub struct GoalConfig {
    // dates as epoch milliseconds (UTC); NaN for invalid input
    pub start_ms: f64,
    pub end_ms: f64,
    pub now_ms: f64,
    pub width: f64,
    pub height: f64,
    pub offset_top: f64,
    pub offset_bottom: f64,
    pub offset_left: f64,
    pub offset_right: f64,
    pub goal_text_top_offset: f64,
    pub ring_style: f64,
    pub dot_scale: f64,
    pub show_text: bool,
    pub elapsed_mode: bool,
    pub has_widgets: bool,
    pub goal_text: String,
    pub bg_color: String,
    pub past_color: String,
    pub current_color: String,
    pub future_color: String,
    pub goal_color: String,
}

// JS Math.max/min propagate NaN; Rust f64::max does not.
fn js_max2(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else {
        b
    }
}
fn js_min2(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a < b {
        a
    } else {
        b
    }
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

// Icon paths copied verbatim from route.ts.
const HEART_PATH: &str = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
const BROKEN_HEART_PATH: &str = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z M12 4l-1 5-1-2 M13 9l1 5 1-2";
const POOP_PATH: &str = "M451.36 369.14C468.66 355.99 480 335.41 480 312c0-39.77-32.24-72-72-72h-14.07c13.42-11.73 22.07-28.78 22.07-48 0-35.35-28.65-64-64-64h-5.88c3.57-10.05 5.88-20.72 5.88-32 0-53.02-42.98-96-96-96-5.17 0-10.15.74-15.11 1.52C250.31 14.64 256 30.62 256 48c0 44.18-35.82 80-80 80h-16c-35.35 0-64 28.65-64 64 0 19.22 8.65 36.27 22.07 48H104c-39.76 0-72 32.23-72 72 0 23.41 11.34 43.99 28.64 57.14C26.31 374.62 0 404.12 0 440c0 39.76 32.24 72 72 72h368c39.76 0 72-32.24 72-72 0-35.88-26.31-65.38-60.64-70.86z";
const PIGGY_PATH: &str = "M29,14h-2.2c-0.2-1.3-0.6-2.5-1.3-3.7c-0.7-1.3-0.5-3,0.6-4.1c0.4-0.4,0.4-1,0-1.4c-2-2-5.2-2-7.3-0.1C17.7,4.2,16.3,4,15,4c-3.9,0-7.5,1.9-9.8,5c-1.5,2-2.2,4.5-2.2,7c0,2.2,0.6,4.3,1.7,6.1l0.1,0.2c-0.1,0.1-0.2,0.1-0.3,0.1C4.2,22.5,4,22.3,4,22c0-0.6-0.4-1-1-1s-1,0.4-1,1c0,1.4,1.1,2.5,2.5,2.5c0.5,0,1-0.2,1.4-0.4l3.3,5.4C9.3,29.8,9.6,30,10,30h4c0.3,0,0.6-0.1,0.8-0.4c0.2-0.2,0.3-0.5,0.2-0.8L14.8,28c0.4,0,0.9,0,1.3,0L16,28.8c0,0.3,0,0.6,0.2,0.8S16.7,30,17,30h4c0.3,0,0.7-0.2,0.8-0.5l2-3.1c2.4-0.9,4.5-2.2,5.9-3.7c0.2-0.2,0.3-0.4,0.3-0.7V15C30,14.4,29.6,14,29,14z M14.9,14.5h1.3c1.6,0,2.9,1.3,2.9,3c0,1.5-1.1,2.7-2.5,2.9V21c0,0.6-0.4,1-1,1s-1-0.4-1-1v-0.6c-1.4-0.2-2.5-1.4-2.5-2.9c0-0.6,0.4-1,1-1s1,0.4,1,1c0,0.5,0.4,0.9,0.9,0.9h1.3c0.5,0,0.9-0.4,0.9-0.9c0-0.5-0.4-1-0.9-1h-1.3c-1.6,0-2.9-1.3-2.9-3c0-1.5,1.1-2.7,2.5-2.9V10c0-0.6,0.4-1,1-1s1,0.4,1,1v0.6c1.4,0.2,2.5,1.4,2.5,2.9c0,0.6-0.4,1-1,1s-1-0.4-1-1c0-0.5-0.4-0.9-0.9-0.9h-1.3c-0.5,0-0.9,0.4-0.9,0.9C14,14.1,14.4,14.5,14.9,14.5z";
const MONEY_PATH: &str = "M108.883,127.722h293.952l25.344-60.16c3.499-5.888,5.141-12.8,4.587-20.779c-1.621-18.667-12.885-34.453-30.187-42.197c-17.216-7.744-37.269-5.547-52.224,5.675c-8.683,6.507-22.187,14.272-37.056,14.272c-9.557,0-17.963-2.283-24.939-6.784c-19.755-12.693-45.205-12.693-65.003,0c-6.976,4.501-15.36,6.784-24.917,6.784c-14.869,0-28.373-7.765-37.056-14.272c-14.997-11.243-35.008-13.419-52.203-5.675c-17.323,7.723-28.608,23.509-30.336,43.712c-0.448,6.635,1.216,13.355,4.693,19.243L108.883,127.722z M417.216,170.389H293.674c7.424,19.968,8.085,37.696,8.149,40.683c-0.192,16.981,10.453,21.312,10.56,21.355c11.072,4.032,16.789,16.277,12.736,27.328c-3.136,8.683-11.328,14.059-20.032,14.059c-2.411,0-4.885-0.405-7.296-1.28c-14.528-5.312-39.061-24.171-38.635-61.312c-0.021,0-0.405-8.427-3.264-18.859c-2.347,8.384-3.243,15.872-3.307,19.477c0,40.299-33.856,82.389-37.696,87.04c-4.224,5.099-10.304,7.723-16.448,7.723c-4.779,0-9.579-1.579-13.568-4.864c-9.088-7.488-10.368-20.928-2.88-30.016c7.232-8.832,27.925-38.827,27.925-60.267c0.064-3.221,0.725-21.056,8.149-41.067H94.506c-28.416,39.552-65.088,110.4-65.088,213.333v16.277c0,37.376,21.931,70.933,55.829,85.504c40.469,17.387,97.856,26.219,170.603,26.219c72.789,0,130.176-8.832,170.624-26.219c33.899-14.592,55.829-48.149,55.829-85.504v-16.277C482.304,280.789,445.632,209.941,417.216,170.389z";
const DACHSHUND_PATH: &str = "M482.129,131.242c-1.095-2.264-3.251-3.828-5.743-4.167l-40.38-5.484c-5.216-0.708-9.409-4.465-10.686-9.57c-0.505-2.019-1.825-3.737-3.646-4.744c-1.438-0.795-35.549-19.273-64.302-1.112c-24.159,15.259-47.777,59.42-53.016,69.635c-12.724,7.195-44.204,21.931-64.441,18.637c-23.125-3.765-109.376-13.822-145.386-17.971c-15.872-1.83-31.65,0.467-45.629,6.64c-9.684,4.276-17.493,9.807-23.356,16.523c-2.502,2.124-11.011,9.85-17.507,21.787c-10.209,18.761-10.702,38.929-1.428,58.325c3.833,8.015,5.485,15.922,4.912,23.502c-0.313,4.13,2.782,7.732,6.913,8.044c0.192,0.015,0.384,0.022,0.573,0.022c3.885,0,7.173-2.997,7.471-6.935c0.773-10.229-1.358-20.694-6.336-31.105c-4.223-8.832-5.504-17.035-5.026-24.405c2.373,12.689,7.608,28.475,17.356,48.053c2.213,4.445,1.489,9.701-1.844,13.391l-9.485,10.501c-2.263,2.504-2.571,6.214-0.758,9.06c5.215,8.184,18.643,32.591,18.161,47.051c-0.067,2.031,0.692,4.003,2.105,5.464s3.358,2.286,5.391,2.286h30.681c4.341,0,8.392-1.72,11.406-4.844c3.014-3.124,4.588-7.233,4.433-11.571c-0.347-9.674-8.2-17.252-17.88-17.252h-2.112l-8.865-16.838c-1.907-4.388-0.867-9.514,2.619-12.811c8.838-8.361,16.746-17.628,23.623-27.604c13.586,1.115,57.455,5.545,93.566,18.48c9.263,3.318,17.072,6.24,23.963,8.818c23.501,8.792,35.758,13.377,52.418,13.637c1.789,15.149,4.865,28.89,6.929,37.072c1.917,7.603,8.734,12.913,16.58,12.913h24.141c8.688,0,15.937-6.514,16.861-15.151c1.008-9.409-5.545-18.003-14.919-19.565c-2.188-0.365-4.21-0.783-6.053-1.25c-0.234-4.468,0.328-10.621,1.24-16.752c35.703-12.65,63.223-41.846,73.706-78.283l11.459-39.834c8.819-6.343,15.743-14.897,20.115-24.893l3.256-7.441c1.378-3.15,4.591-5.162,8.047-5.001l8.047,0.372c17.794,0.82,34.543-8.201,43.641-23.551l8.884-14.992C483.111,136.167,483.223,133.505,482.129,131.242z";
const CAT_PATH: &str = "M30,108.785c9,4.601,19.1,7,29.2,7.2c0.5,0,1.1,0,1.6,0c10.2,0,20.3-2.2,29.5-6.6c8.399-4,16-10,21.601-17.5c6.399-8.601,9.699-18.9,9.699-29.601c0-6.8,0-13.5,0-20.3c0-7.4,0-14.7,0-22.1c0-2.6,0-5.2,0-7.7c0-4.7-4.699-7.8-9-6.1l-22.8,9.5c-1.5,0.6-3.2,0.7-4.7,0.1c-7.4-2.9-15.6-4.4-24.3-4.4s-16.9,1.6-24.3,4.4c-1.5,0.6-3.2,0.5-4.7-0.1L9,6.385c-4.3-1.8-9,1.4-9,6.1c0,3.5,0,7.1,0,10.6c0,7.3,0,14.6,0,22c0,6.2,0,12.3,0,18.5c0,9.9,3.2,19.5,8.9,27.5C14.3,98.585,21.7,104.585,30,108.785z M83,62.485c5.5,0,10,4.5,10,10s-4.5,10-10,10s-10-4.5-10-10C73,66.886,77.5,62.485,83,62.485z M38.6,62.485c5.5,0,10,4.5,10,10s-4.5,10-10,10s-10-4.5-10-10C28.6,66.886,33.1,62.485,38.6,62.485z";
const PAW_PATH: &str = "M375.786,368.016c-1.022,62.699-34.434,85.385-69.898,83.283c-35.465-2.093-60.132-18.537-85.32-18.537l-1.032,0.576c-25.188,0-49.854,17.021-85.319,19.114c-35.466,2.093-68.876-19.449-69.898-82.148c2.056-57.565,45.911-61.798,83.265-129.8c32.891-59.881,71.954-55.035,71.954-55.035h1.03c0,0,39.4-4.586,71.955,55.035C329.698,308.599,373.73,310.449,375.786,368.016z M156.203,159.636c31.413-2.382,54.172-40.021,50.832-84.071c-3.34-44.049-31.514-77.828-62.927-75.446C112.695,2.501,89.936,40.141,93.276,84.19C96.616,128.239,124.789,162.018,156.203,159.636z M275.264,160.401c30.698,8.368,65.097-19.742,76.83-62.786c11.732-43.044-3.642-84.722-34.339-93.09c-30.698-8.368-65.097,19.742-76.829,62.786C229.193,110.354,244.566,152.033,275.264,160.401z M417.486,125.937c-26.732-7.288-56.688,17.19-66.905,54.674c-10.217,37.484,3.171,73.777,29.903,81.064c26.733,7.287,56.688-17.191,66.906-54.675C457.608,169.518,444.22,133.224,417.486,125.937z M102.008,180.608c-10.218-37.482-40.172-61.961-66.905-54.674s-40.122,43.581-29.904,81.064c10.218,37.482,40.173,61.961,66.906,54.674C98.837,254.386,112.225,218.092,102.008,180.608z";
const EMO_PATH: &str = "M29.8,27.4l-3.6-4.8C24.1,19.9,23,16.4,23,13c0-5.5-4.5-10-10-10S3,7.5,3,13v6.1c0,5.4,4.4,9.9,9.9,9.9H29c0.4,0,0.7-0.2,0.9-0.6C30.1,28.1,30,27.7,29.8,27.4z M12,9c0-0.6,0.4-1,1-1s1,0.4,1,1v2c0,0.6-0.4,1-1,1s-1-0.4-1-1V9z M8,9c0-0.6,0.4-1,1-1s1,0.4,1,1v2c0,0.6-0.4,1-1,1s-1-0.4-1-1V9z M15,20c0,0.6-0.4,1-1,1H8c-0.6,0-1-0.4-1-1v-3c0-2.2,1.8-4,4-4s4,1.8,4,4V20z";
const GOLD_INGOT_PATH: &str = "M238.896,389.648 L0,389.648 L31.424,277.041 L207.472,277.041 z M512,389.648 L273.104,389.648 L304.528,277.041 L480.576,277.041 z M375.448,234.96 L136.552,234.96 L167.976,122.352 L344.024,122.352 z M31.424,277.041 L109.56,277.041 L9.664,355.024 z M167.984,122.352 L246.112,122.352 L146.216,200.336 z M304.528,277.041 L382.664,277.041 L282.768,355.024 z";
const PINK_GWAGEN_PATH: &str = "m61.21 175.94c0 9.01-7.3 16.31-16.31 16.31h-7.59c-9.01 0-16.31-7.3-16.31-16.31v-16.22h40.21c0 0 0 16.22 0 16.22zm117.65 0c0 9.01-7.31 16.31-16.32 16.31h-7.58c-9.01 0-16.32-7.3-16.32-16.31v-16.22h40.22c0 0 0 16.22 0 16.22zm13.39-25.45c0 3.4-2.76 6.15-6.15 6.15h-172.2c-3.39 0-6.15-2.75-6.15-6.15v-15.93c0-3.39 2.75-6.15 6.15-6.15h172.2c3.39 0 6.15 2.75 6.15 6.15zm-172.2-9.79v3.64h159.9v-3.64zm14.2-127.09c0.15-3.28 2.86-5.87 6.14-5.87h119.21c3.28 0 5.99 2.59 6.14 5.87l1.39 29.31h18.96c3.4 0 6.15 2.76 6.15 6.15v20.63c0 3.4-2.75 6.15-6.15 6.15h-17.41l0.16 3.55c3.27 1.15 6.28 3.02 8.77 5.51 4.36 4.36 6.81 10.27 6.81 16.43v23.98h-168.85v-23.98c0-6.16 2.45-12.07 6.8-16.43 2.5-2.49 5.51-4.36 8.77-5.51l0.17-3.55h-17.42c-3.39 0-6.15-2.75-6.15-6.15v-20.63c0-3.39 2.76-6.15 6.15-6.15h18.97zm14.42 78.35c-7.31 0-13.25 5.93-13.25 13.24 0 7.32 5.94 13.25 13.25 13.25 7.31 0 13.25-5.93 13.25-13.25 0-7.31-5.94-13.24-13.25-13.24zm102.66 0c-7.32 0-13.25 5.93-13.25 13.24 0 7.32 5.93 13.25 13.25 13.25 7.31 0 13.24-5.93 13.24-13.25 0-7.31-5.93-13.24-13.24-13.24zm-80.66 6.82v13.24c0 3.4 2.75 6.15 6.15 6.15 3.39 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.76-6.15-6.15-6.15-3.4 0-6.15 2.75-6.15 6.15zm16.55 0v13.24c0 3.4 2.76 6.15 6.15 6.15 3.4 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.75-6.15-6.15-6.15-3.39 0-6.15 2.75-6.15 6.15zm33.12 0v13.24c0 3.4 2.76 6.15 6.15 6.15 3.4 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.75-6.15-6.15-6.15-3.39 0-6.15 2.75-6.15 6.15zm-16.56 0v13.24c0 3.4 2.76 6.15 6.15 6.15 3.4 0 6.15-2.75 6.15-6.15v-13.24c0-3.4-2.76-6.15-6.15-6.15-3.4 0-6.15 2.75-6.15 6.15zm-58.91-49.42v0.01l-0.97 20.63v0.02l-0.38 8.09h112.95l-2.73-58.06h-107.48c0 0-1.38 29.31-1.39 29.31z";

/// Build the days grid exactly like `generateDaysGrid()` in route.ts.
#[allow(clippy::too_many_arguments)]
fn generate_days_grid(
    total_days: f64,
    current_day_index: f64,
    base_size: f64,
    render_size: f64,
    gap_horizontal: f64,
    gap_vertical: f64,
    ring_style: f64,
    past_color: &str,
    current_color: &str,
    future_color: &str,
) -> String {
    let mut out = String::new();
    let mut x: f64 = 0.0;
    let mut y: f64 = 0.0;
    const CIRCLES_PER_ROW: f64 = 15.0;

    if !total_days.is_finite() || total_days <= 0.0 {
        return out; // JS loop `for (let i = 0; i < totalDays; i++)` never runs
    }

    let mut i: f64 = 0.0;
    while i < total_days {
        let is_past = i < current_day_index;
        let is_current = i == current_day_index;

        let shape: String = if ring_style == 2.0 {
            let svg_width = render_size;
            let svg_height = render_size;
            let path = if is_past {
                HEART_PATH
            } else if is_current {
                HEART_PATH
            } else {
                BROKEN_HEART_PATH
            };
            let fill = if is_past {
                past_color
            } else if is_current {
                current_color
            } else {
                future_color
            };
            format!(
                "<svg width=\"{}\" height=\"{}\" viewBox=\"0 0 24 24\" x=\"{}\" y=\"{}\"><path d=\"{}\" fill=\"{}\"/></svg>",
                js_to_string(svg_width), js_to_string(svg_height), js_to_string(x), js_to_string(y), path, fill
            )
        } else if ring_style == 3.0 {
            icon_shape(render_size, "0 0 512 512", POOP_PATH, past_color, current_color, future_color, is_past, is_current, x, y, 0.0)
        } else if ring_style == 4.0 {
            icon_shape(render_size, "0 0 32 32", PIGGY_PATH, past_color, current_color, future_color, is_past, is_current, x, y, 0.0)
        } else if ring_style == 5.0 {
            icon_shape(render_size, "0 0 511.722 511.722", MONEY_PATH, past_color, current_color, future_color, is_past, is_current, x, y, 0.0)
        } else if ring_style == 6.0 {
            icon_shape(render_size * 1.3, "0 0 482.877 482.877", DACHSHUND_PATH, past_color, current_color, future_color, is_past, is_current, x, y, (base_size - render_size * 1.3) / 2.0)
        } else if ring_style == 7.0 {
            icon_shape(render_size, "0 0 121.6 121.6", CAT_PATH, past_color, current_color, future_color, is_past, is_current, x, y, 0.0)
        } else if ring_style == 8.0 {
            icon_shape(render_size, "0 0 452.589 452.59", PAW_PATH, past_color, current_color, future_color, is_past, is_current, x, y, 0.0)
        } else if ring_style == 9.0 {
            icon_shape(render_size, "0 0 32 32", EMO_PATH, past_color, current_color, future_color, is_past, is_current, x, y, 0.0)
        } else if ring_style == 10.0 {
            icon_shape(render_size * 2.1, "0 0 512 512", GOLD_INGOT_PATH, past_color, current_color, future_color, is_past, is_current, x, y, (base_size - render_size * 2.1) / 2.0)
        } else if ring_style == 11.0 {
            icon_shape(render_size * 1.5, "0 0 200 200", PINK_GWAGEN_PATH, past_color, current_color, future_color, is_past, is_current, x, y, (base_size - render_size * 1.5) / 2.0)
        } else if is_past {
            if ring_style == 0.0 || ring_style == 1.0 {
                use_ref("past-circle", x, y, base_size)
            } else {
                inline_circle(x, y, render_size, past_color)
            }
        } else if is_current {
            if ring_style == 0.0 || ring_style == 1.0 {
                use_ref("current-circle", x, y, base_size)
            } else {
                inline_circle(x, y, render_size, current_color)
            }
        } else if ring_style == 0.0 || ring_style == 1.0 {
            use_ref("future-circle", x, y, base_size)
        } else {
            inline_circle(x, y, render_size, future_color)
        };

        out.push_str(&shape);

        x += base_size + gap_horizontal;

        let next = i + 1.0;
        if next % CIRCLES_PER_ROW == 0.0 && i < total_days - 1.0 {
            x = 0.0;
            y += base_size + gap_vertical;
        }

        i += 1.0;
    }

    out
}

fn icon_shape(
    size: f64,
    view_box: &str,
    path: &str,
    past_color: &str,
    current_color: &str,
    future_color: &str,
    is_past: bool,
    is_current: bool,
    x: f64,
    y: f64,
    offset: f64,
) -> String {
    let icon_color = if is_past {
        past_color
    } else if is_current {
        current_color
    } else {
        future_color
    };
    format!(
        "<svg width=\"{}\" height=\"{}\" viewBox=\"{}\" x=\"{}\" y=\"{}\"><path d=\"{}\" fill=\"{}\"/></svg>",
        js_to_string(size),
        js_to_string(size),
        view_box,
        js_to_string(x + offset),
        js_to_string(y + offset),
        path,
        icon_color
    )
}

fn use_ref(id: &str, x: f64, y: f64, base_size: f64) -> String {
    format!(
        "<use href=\"#{}\" x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\"/>",
        id,
        js_to_string(x),
        js_to_string(y),
        js_to_string(base_size),
        js_to_string(base_size)
    )
}

fn inline_circle(x: f64, y: f64, render_size: f64, color: &str) -> String {
    format!(
        "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{}\"/>",
        js_to_string(x + render_size / 2.0),
        js_to_string(y + render_size / 2.0),
        js_to_string(render_size / 2.0),
        color
    )
}

/// Generate the full SVG document (byte-identical to the reference engine).
pub fn generate_svg(cfg: &GoalConfig) -> String {
    let ms_per_day = 24.0 * 60.0 * 60.0 * 1000.0;
    let width = cfg.width;
    let height = cfg.height;

    let padding = 60.0;

    let widget_space = if cfg.has_widgets { js_round(height * 0.15) } else { 0.0 };

    let safe_area_top_px = js_round(height * (cfg.offset_top / 100.0));
    let safe_area_bottom_px = js_round(height * (cfg.offset_bottom / 100.0));
    let safe_area_left_px = js_round(width * (cfg.offset_left / 100.0));
    let safe_area_right_px = js_round(width * (cfg.offset_right / 100.0));

    let effective_padding = js_max2(js_max2(padding, safe_area_left_px), safe_area_right_px);
    let _ = effective_padding; // computed in the original, never used downstream
    let _available_width = width - 2.0 * effective_padding;

    let total_days = ((cfg.end_ms - cfg.start_ms) / ms_per_day).floor() + 1.0;
    let raw_days_passed = ((cfg.now_ms - cfg.start_ms) / ms_per_day).floor();
    let days_passed = if raw_days_passed >= 0.0 { raw_days_passed + 1.0 } else { 0.0 };

    let mut current_day_index = -1.0;
    if days_passed > 0.0 && days_passed < total_days {
        current_day_index = days_passed - 1.0;
    }

    let percentage = js_to_fixed_1((days_passed / total_days) * 100.0);

    let (display_days, display_text) = if cfg.elapsed_mode {
        let elapsed_days = ((cfg.now_ms - cfg.start_ms) / ms_per_day).floor();
        (js_max2(elapsed_days, 0.0), "elapsed")
    } else {
        (total_days - days_passed, "until")
    };

    let content_width = width - safe_area_left_px - safe_area_right_px;
    let calendar_top_y = widget_space + safe_area_top_px;
    let available_height = height - calendar_top_y - safe_area_bottom_px;

    let grid_top_offset_base = js_round(available_height * 0.05);
    let bottom_text_height = js_round(available_height * 0.15);
    let calendar_height = available_height - grid_top_offset_base - bottom_text_height;

    let gap_horizontal_px = js_round(content_width * 0.03);
    let gap_vertical_px = js_round(calendar_height * 0.02);

    let circles_per_row = 15.0;
    let circle_from_width = (content_width - (circles_per_row - 1.0) * gap_horizontal_px) / circles_per_row;

    let target_rows = (total_days / circles_per_row).ceil();
    let circle_from_height = calendar_height / target_rows;

    let final_circle_size = js_min2(circle_from_width, circle_from_height);

    let scaled_circle_size = final_circle_size * cfg.dot_scale;

    let grid_width = circles_per_row * final_circle_size + (circles_per_row - 1.0) * gap_horizontal_px;
    let grid_offset_x = safe_area_left_px + (content_width - grid_width) / 2.0;

    let content_center = safe_area_left_px + content_width / 2.0;
    let font_size = js_round(content_width * 0.035);

    let goal_font_size = js_round(font_size * 1.5);
    let goal_line_height = js_round(goal_font_size * 1.3);
    let goal_lines: Vec<&str> = if cfg.goal_text.is_empty() {
        Vec::new()
    } else {
        cfg.goal_text.split('\n').collect()
    };
    let goal_text_height = if !goal_lines.is_empty() {
        js_round(goal_line_height * goal_lines.len() as f64 + font_size * 0.5)
    } else {
        0.0
    };
    let grid_top_offset = grid_top_offset_base + goal_text_height;

    // Goal text tspans
    let goal_text_svg = if goal_lines.is_empty() {
        String::new()
    } else {
        goal_lines
            .iter()
            .enumerate()
            .map(|(index, line)| {
                let y_pos = index as f64 * goal_line_height;
                format!(
                    "<tspan x=\"{}\" y=\"{}\" text-anchor=\"middle\">{}</tspan>",
                    js_to_string(content_center),
                    js_to_string(y_pos),
                    escape_html(line)
                )
            })
            .collect::<Vec<_>>()
            .join("\n        ")
    };

    // Symbols for styles 0/1
    let use_symbols = cfg.ring_style == 0.0 || cfg.ring_style == 1.0;
    let half = final_circle_size / 2.0;
    let symbols = if use_symbols {
        let past = if cfg.ring_style == 0.0 {
            format!(
                "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"none\" stroke=\"{}\" stroke-width=\"{}\"/>",
                js_to_string(half),
                js_to_string(half),
                js_to_string(half - final_circle_size * 0.075),
                cfg.past_color,
                js_to_string(final_circle_size * 0.15)
            )
        } else {
            format!(
                "<circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{}\"/>",
                js_to_string(half), js_to_string(half), js_to_string(half), cfg.past_color
            )
        };
        format!(
            "\n      <defs>\n        <symbol id=\"past-circle\">\n          {}\n        </symbol>\n        <symbol id=\"current-circle\">\n          <circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{}\"/>\n        </symbol>\n        <symbol id=\"future-circle\">\n          <circle cx=\"{}\" cy=\"{}\" r=\"{}\" fill=\"{}\"/>\n        </symbol>\n      </defs>",
            past,
            js_to_string(half), js_to_string(half), js_to_string(half), cfg.current_color,
            js_to_string(half), js_to_string(half), js_to_string(half), cfg.future_color
        )
    } else {
        String::new()
    };

    let grid = generate_days_grid(
        total_days,
        current_day_index,
        final_circle_size,
        scaled_circle_size,
        gap_horizontal_px,
        gap_vertical_px,
        cfg.ring_style,
        &cfg.past_color,
        &cfg.current_color,
        &cfg.future_color,
    );

    let w = js_to_string(width);
    let h = js_to_string(height);

    let widget_block = if cfg.has_widgets && widget_space > 0.0 {
        "\n      <!-- Widget Area (space reserved for iOS widgets) -->\n      <!-- No text rendered - space reserved only -->\n      ".to_string()
    } else {
        String::new()
    };

    let goal_block = if !goal_lines.is_empty() {
        let ty = widget_space
            + safe_area_top_px
            + js_round(available_height * 0.05)
            + js_round(height * (cfg.goal_text_top_offset / 100.0));
        format!(
            "\n      <!-- Goal Text -->\n      <g transform=\"translate(0, {})\">\n        <text font-family=\"'Custom', 'Noto Color Emoji', 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', 'Fantasy', cursive, sans-serif\" font-size=\"{}\" font-weight=\"bold\" fill=\"{}\" style=\"text-shadow: 2px 2px 4px rgba(0,0,0,0.3);\">\n        {}\n        </text>\n      </g>\n      ",
            js_to_string(ty),
            js_to_string(goal_font_size),
            cfg.goal_color,
            goal_text_svg
        )
    } else {
        String::new()
    };

    let show_text_block = if cfg.show_text {
        format!(
            "\n      <!-- Bottom Text (positioned between iPhone buttons) -->\n      <g transform=\"translate(0, {})\" style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\">\n        <text x=\"{}\" y=\"0\" text-anchor=\"middle\" font-size=\"{}\" font-weight=\"600\">\n          <tspan fill=\"{}\">{}d {}</tspan>\n          <tspan fill=\"#999999\"> {}%</tspan>\n        </text>\n      </g>\n      ",
            js_to_string(height - 220.0),
            js_to_string(content_center),
            js_to_string(font_size),
            cfg.current_color,
            js_to_string(display_days),
            display_text,
            percentage
        )
    } else {
        String::new()
    };

    format!(
        "\n    <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w}\" height=\"{h}\">\n      <rect width=\"{w}\" height=\"{h}\" fill=\"{}\"/>\n      {symbols}\n\n      {widget_block}\n\n      {goal_block}\n\n      <!-- Calendar Container -->\n      <g transform=\"translate(0, {})\">\n        <!-- Grid -->\n        <g transform=\"translate({}, {})\">\n          {}\n        </g>\n      </g>\n\n      {show_text_block}\n    </svg>\n  ",
        cfg.bg_color,
        js_to_string(calendar_top_y),
        js_to_string(grid_offset_x),
        js_to_string(grid_top_offset),
        grid
    )
}
