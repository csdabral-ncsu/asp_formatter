import { MDCTopAppBar } from '@material/top-app-bar/index';
import { MDCDrawer } from "@material/drawer/index";
import { MDCTextField } from '@material/textfield/index';
import { MDCRipple } from "@material/ripple/index";
import { MDCChipSet } from '@material/chips/index';
import { MDCSwitch } from '@material/switch/index';
import { MDCSelect } from '@material/select/index';

import { text, el, svg, mount } from 'redom';

import { AnswerSet, Graph } from "./filter";
import { create } from 'domain';

// D3
import * as d3_base from 'd3';
import * as d3_dag from 'd3-dag';

// Merge both namespaces
const d3 = Object.assign({}, d3_base, d3_dag);

// Top bar
const topAppBarEl = document.querySelector('.mdc-top-app-bar');
const topAppBar = new MDCTopAppBar(topAppBarEl);
topAppBar.setScrollTarget(document.getElementById('main-content'));

// Drawer
const drawerEl = document.getElementById('aspf-drawer');
const drawer = new MDCDrawer(drawerEl);
topAppBar.listen('MDCTopAppBar:nav', () => {
    drawer.open = !drawer.open;
});

// Clingo output textarea
const clingoOutput = new MDCTextField(document.getElementById('aspf-clingo-output'));

// Add ripple to all buttons
const buttons = document.querySelectorAll('.mdc-button');
buttons.forEach(MDCRipple.attachTo);

// Go button
const goButton = document.getElementById('aspf-go');
goButton.addEventListener("click", () => { processAnswerSet(clingoOutput.value) });

// Timeline graph
const timeline = document.getElementById("aspf-timeline");
let filter_timestep = "";
const clearTimelineButton = document.getElementById('aspf-deselect-timestep');
clearTimelineButton.addEventListener("click", () => { filter_timestep = ""; populateOutput(); });

let answerSet = new AnswerSet("");
let graph = new Graph(answerSet);
let svgtree = null;
function processAnswerSet(raw_input) {
    try {
        answerSet = new AnswerSet(raw_input);
        graph = new Graph(answerSet);
        
    } catch (e) {
        output.innerHTML = e;
        return;
    }
    drawer.open = true;
    // Filters
    const filters = answerSet.get_filters();
    createFilterOptions(filters);
    // Sort options
    const maxNumArgs = answerSet.get_max_numargs();
    const so = maxNumArgs == 0 ? [] : [...Array(maxNumArgs).keys()];
    createSortOptions(so);
    
    // Draw timeline
    removeAllChildren(timeline); // delete any existing graph

    drawTimelineGraph('aspf-timeline', graph, 20, 800, 600, 50);
    
    // const notation = graph.get_newick_notation();
    // svgtree = new SVGTree(notation, timeline, {
    //     orientation: 'h',
    //     size: [800, 200],
    //     depthDistance: 40,
    //     leafDistance: 20,
    //     labelBackgrounds: true,
    //     interaction: ["rearrange"],
    //     onselect: function (node) {
    //         if (node !== null) {
    //             filter_timestep = node.data;
    //             populateOutput();
    //         }
    //     }
    // });

    populateOutput();
}

function drawTimelineGraph(domElementName, graph, nodeRadius, frameWidth, frameHeight, margin) {
    // From https://observablehq.com/@erikbrinkman/d3-dag-sugiyama

    const d3dag_notation = graph.get_d3dag_notation();
    const dag = d3.dagStratify()(d3dag_notation);
    const width = frameWidth - 2 * margin;
    const height = frameHeight - 2 * margin;
    // const layout = d3.zherebko()
    //     .size([width, height]);
    const layout = d3.sugiyama()
        .size([width, height])
        .layering(d3.layeringSimplex())
        .decross(d3.decrossOpt())
        .coord(d3.coordCenter());


    const svgSelection = d3.select('#' + domElementName)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr("viewBox", `${-nodeRadius} ${-nodeRadius} ${width + 2 * nodeRadius} ${height + 2 * nodeRadius}`);

    const defs = svgSelection.append('defs'); // For gradients


    // Use computed layout
    layout(dag);

    const steps = dag.size();
    const interp = d3.interpolateRainbow;
    const colorMap = {};
    dag.each((node, i) => {
        colorMap[node.id] = interp(i / steps);
    });

    // How to draw edges
    const line = d3.line()
        .curve(d3.curveCatmullRom)
        .x(d => d.x)
        .y(d => d.y);

    // Plot edges
    svgSelection.append('g')
        .selectAll('path')
        .data(dag.links())
        .enter()
        .append('path')
        .attr('d', ({ data }) => line(data.points))
        .attr('fill', 'none')
        .attr('stroke-width', 3)
        .attr('stroke', ({ source, target }) => {
            const gradId = `${source.id}-${target.id}`;
            const grad = defs.append('linearGradient')
                .attr('id', gradId)
                .attr('gradientUnits', 'userSpaceOnUse')
                .attr('x1', source.x)
                .attr('x2', target.x)
                .attr('y1', source.y)
                .attr('y2', target.y);
            grad.append('stop').attr('offset', '0%').attr('stop-color', colorMap[source.id]);
            grad.append('stop').attr('offset', '100%').attr('stop-color', colorMap[target.id]);
            return `url(#${gradId})`;
        });

    // Select nodes
    const nodes = svgSelection.append('g')
        .selectAll('g')
        .data(dag.descendants())
        .enter()
        .append('g')
        .attr('transform', ({ x, y }) => `translate(${x}, ${y})`)
        .on('click', (d) => { filter_timestep = d.id; populateOutput(); });

    // Plot node circles
    nodes.append('circle')
        .attr('r', nodeRadius)
        .attr('fill', n => colorMap[n.id]);

    const arrow = d3.symbol().type(d3.symbolTriangle).size(nodeRadius * nodeRadius / 5.0);
    svgSelection.append('g')
        .selectAll('path')
        .data(dag.links())
        .enter()
        .append('path')
        .attr('d', arrow)
        .attr('transform', ({
            source,
            target,
            data
        }) => {
            const [end, start] = data.points.reverse();
            // This sets the arrows the node radius (20) + a little bit (3) away from the node center, on the last line segment of the edge. This means that edges that only span ine level will work perfectly, but if the edge bends, this will be a little off.
            const dx = start.x - end.x;
            const dy = start.y - end.y;
            const scale = nodeRadius * 1.15 / Math.sqrt(dx * dx + dy * dy);
            // This is the angle of the last line segment
            const angle = Math.atan2(-dy, -dx) * 180 / Math.PI + 90;
            console.log(angle, dx, dy);
            return `translate(${end.x + dx * scale}, ${end.y + dy * scale}) rotate(${angle})`;
        })
        .attr('fill', ({ target }) => colorMap[target.id])
        .attr('stroke', 'white')
        .attr('stroke-width', 1.5);

    // Add text to nodes
    nodes.append('text')
        .text(d => d.id)
        .attr('font-weight', 'bold')
        .attr('font-family', 'sans-serif')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .attr('fill', 'white');
}

function removeAllChildren(element) {
    while (element.lastChild) {
        element.removeChild(element.lastChild);
    }
}

// Output
const output = document.getElementById('aspf-output');
function populateOutput() {
    const enabledFilters = filterChipSet.chips.filter(chip => chip.selected).map((chip) => chip.root_.children[1].textContent);
    // console.log(enabledFilters);
    const filtered = answerSet.filter(enabledFilters);
    // console.log(filtered);
    const filtered_by_argvalue = answerSet.filter_by_argvalue(0, filter_timestep, filtered);
    const grouped = answerSet.group(byNameSwitch.checked, byNumargsSwitch.checked, filtered_by_argvalue);
    // console.log(grouped);
    answerSet.sort(sortSelect.value, grouped);

    // clear output
    removeAllChildren(output);

    // build output
    const list = el("ul.mdc-list");
    const firstDivider = el("hr.mdc-list-divider");
    mount(list, firstDivider);
    for (const [k, v] of Object.entries(grouped)) {
        const header = el("h3.mdc-list-group__subheader.aspf-group", k);
        mount(list, header);
        const elements = v.map((x) => el("li.mdc-list-item__text", x.output()));
        elements.forEach((x) => mount(list, x));
        const divider = el("hr.mdc-list-divider");
        mount(list, divider);
        // console.log(v);
    }
    mount(output, list);
}

const parameters = {
    filtered_predicates: [],
    group_by_name: false,
    group_by_numargs: false,
    sort_by: "",
};

// Filter
const filterChipSetEl = document.getElementById('aspf-filter-chip-set');
let filterChipSet = new MDCChipSet(filterChipSetEl);
filterChipSet.listen('MDCChip:removal', (event) => {
    filterChipSetEl.removeChild(event.detail.root);
});
filterChipSet.listen('MDCChip:selection', () => {
    populateOutput();
});

function clearFilterOptions() {
    filterChipSet.chips.forEach((c) => c.beginExit());
}

function createFilterOptions(options) {
    clearFilterOptions();

    for (let o of options) {
        const path = svg('path.mdc-chip__checkmark-path', {
            fill: 'none',
            stroke: 'black',
            d: 'M1.73,12.91 8.1,19.28 22.79,4.59',
        });
        const chip =
            el('button.mdc-chip.mdc-chip--selected',
                [
                    el('span.mdc-chip__checkmark',
                        svg('svg.mdc-chip__checkmark-svg', path, { viewBox: '-2 -3 30 30' })
                    ),
                    el('span.mdc-chip__text', text(o)),
                ]
            );
        mount(filterChipSetEl, chip);
        filterChipSet.addChip(chip);
    }
}

const aspfFilterAll = document.getElementById('aspf-filter-all');
const aspfFilterNone = document.getElementById('aspf-filter-none');
aspfFilterAll.addEventListener('click', () => {
    filterChipSet.chips.forEach((chip) => chip.selected = true);
});
aspfFilterNone.addEventListener('click', () => {
    filterChipSet.chips.forEach((chip) => chip.selected = false);
});

// Group switches
const byNameSwitchEl = document.getElementById('aspf-group-by-name');
const byNameSwitch = new MDCSwitch(byNameSwitchEl);
byNameSwitchEl.addEventListener('change', () => {
    if (!byNameSwitch.checked) {
        byNumargsSwitch.checked = false;
        parameters['group_by_numargs'] = false;
    }
    byNumargsSwitch.disabled = !byNameSwitch.checked;
    parameters['group_by_name'] = byNameSwitch.checked;
    // console.log(parameters);
    populateOutput();
});

const byNumargsSwitchEl = document.getElementById('aspf-group-by-numargs');
const byNumargsSwitch = new MDCSwitch(byNumargsSwitchEl);
if (!byNameSwitch.checked) byNumargsSwitch.checked = false;
byNumargsSwitch.disabled = !byNameSwitch.checked;
byNumargsSwitchEl.addEventListener('change', () => {
    if (byNumargsSwitch.disabled) return;
    parameters['group_by_numargs'] = byNumargsSwitch.checked;
    populateOutput();
});

// Sort
const sortSelect = new MDCSelect(document.getElementById('aspf-sort-by'));
const sortOptions = document.getElementById('aspf-sort-by-options');

function clearSortOptions() {
    const options = sortOptions.children;
    Array.from(options).forEach((o) => o.parentNode.removeChild(o));
}

function createSortOptions(options) {
    clearSortOptions();

    // Create common options
    const empty = el('li.mdc-list-item.mdc-list-item--selected', text(''), { 'data-value': '' });
    mount(sortOptions, empty);
    const first = el('li.mdc-list-item', text('First'), { 'data-value': '0' });
    mount(sortOptions, first);
    const last = el('li.mdc-list-item', text('Last'), { 'data-value': 'last' });
    mount(sortOptions, last);

    // Create given options
    for (let o of options) {
        const op = el('li.mdc-list-item', text(o), { 'data-value': o });
        mount(sortOptions, op);
    }

    sortSelect.selectedIndex = 0;
}

sortSelect.listen('MDCSelect:change', () => {
    populateOutput();
});