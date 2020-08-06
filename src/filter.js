import { tuple } from "immutable-tuple";

// For now, Predicate args are just strings. Later, they may be represented as nested Predicates, which might be useful for some advanced filtering.
export class Predicate {
    raw_input;
    name;
    args;
    constructor(raw_input) {
        this.raw_input = raw_input.trim();

        const left_paren_match = this.raw_input.match(/\(/);
        let right_paren_index = this.raw_input.lastIndexOf(")");

        if (left_paren_match) {
            if (right_paren_index === -1) {
                console.error("missing right paren: " + this.raw_input);
                right_paren_index = this.raw_input.length;
            }

            this.name = this.raw_input.substring(0, left_paren_match.index);
            const args_str = this.raw_input.substring(left_paren_match.index + 1, right_paren_index);
            this.args = this.parse_args(args_str);

        } else {
            this.name = this.raw_input;
            this.args = [];
        }
    }

    get_signature() {
        return this.name + "/" + this.args.length;
    }

    parse_args(args_str) {
        let nesting_level = 0;
        let top_level_commas = [];
        for (let [i, s] of args_str.split("").entries()) { // for-of without index works with string, but not with. What the heck, JS?
            if (nesting_level === 0 && s === ",") {
                top_level_commas.push(i);
            } else if (s === "(") {
                nesting_level++;
            } else if (s === ")") {
                nesting_level--;
            }

            if (nesting_level < 0) {
                console.error("Nesting level negative:" + [args_str, i]);
            }
        }

        if (nesting_level != 0) {
            console.error("Not all parens resolved:" + args_str);
        }

        top_level_commas.push(args_str.length); // So we also get the last segment from the following loop
        const args = [];
        let end = -1;
        for (let c of top_level_commas) {
            const start = end + 1;
            end = c;
            args.push(args_str.substring(start, end));
        }

        return args;
    }

    output() {
        if (this.name !== "__output") {
            return this.raw_input;
        }

        return this.args.slice(1).reduce((p, c) => (p + " " + c.replace(/"/g, "")), this.args[0]+": ");
    }
}

export class AnswerSet {
    raw_input;
    trimmed;
    predicates;

    constructor(raw_input) {
        this.raw_input = raw_input.trim();

        // Multiple answers are not supported yet:
        if ((this.raw_input.match(/Answer:/g) || []).length > 1) {
            throw "Please paste in one answer set at a time. Multiple sets will be supported later.";
        }

        let trimmed = this.raw_input;

        const answer_match = this.raw_input.match(/Answer:\s*[0-9]+\s+/);
        if (answer_match) {
            const l = answer_match[0].length;
            trimmed = trimmed.substring(answer_match.index + l);
        }

        const satisfiable_match = trimmed.match(/\s+SATISFIABLE/);
        if (satisfiable_match) {
            trimmed = trimmed.substring(0, satisfiable_match.index);
        }

        this.trimmed = trimmed;

        const split = this.trimmed.split(/\s+/);
        this.predicates = split.map(p => new Predicate(p));

        // console.log(this.get_filters());
        // // console.log(this.filter(["happens/2"]));
        // let grouped_preds = this.group(true, false, this.predicates);
        // this.sort(0, grouped_preds);
        // console.log(grouped_preds);
    }

    get_filters() {
        const preds = this.predicates.map((x) => tuple(x.name, x.args.length));
        let filters = new Set(preds);
        filters = Array.from(filters);
        filters.sort((a, b) => a[1] - b[1]);
        filters.sort((a, b) => {
            if (a[0] < b[0]) return -1;
            if (a[0] > b[0]) return 1;
            return 0;
        }); // Why the heck isn't there a key-based approach to sorting?

        filters = filters.map((x) => x[0] + "/" + x[1]);
        return filters;
    }

    filter(enabled_filters) { // enabled_filters is a list of predicate signatures
        return this.predicates.filter((x) => enabled_filters.includes(x.get_signature()));
    }

    filter_by_argvalue(arg_num = 0, arg_value, predicates) { // Return only predicates that have an arg equal to arg_value at position arg_num
        if (arg_value === "") { // Do not filter
            return predicates;
        }
        return predicates.filter((x) => (x.args.length > arg_num) && (x.args[arg_num] === arg_value));
    }

    group(by_name, by_num_args, predicates) { // Assume !by_name => !by_num_args
        if (!by_name) {
            return { "*/*": predicates }; // no grouping
        }

        const grouped = {};

        if (by_name && !by_num_args) {
            for (let p of predicates) {
                const name = p.name + "/*";
                if (name in grouped) {
                    grouped[name].push(p);
                } else {
                    grouped[name] = [p];
                }
            }

            return grouped;
        }

        // by_name && by_num_args
        for (let p of predicates) {
            const signature = p.get_signature();
            if (signature in grouped) {
                grouped[signature].push(p);
            } else {
                grouped[signature] = [p];
            }
        }
        return grouped;
    }

    sort(arg_num, grouped_preds) { // In-place sorts the grouped predicates
        
        if (arg_num === "") { // Don't sort
            return grouped_preds;
        }

        if (!Number.isNaN(new Number(arg_num))) {
            arg_num = new Number(arg_num).valueOf();
        }

        const compare_general = (a, b) => {
            // try to convert both to number:
            const a_num = Number(a).valueOf();
            const b_num = Number(b).valueOf();
            if (!Number.isNaN(a_num)) a = a_num;
            if (!Number.isNaN(b_num)) b = b_num;
            
            if (a < b) return -1;
            if (a > b) return 1;
            return 0;
        };

        let compare = null;

        // console.log(arg_num);
        if (typeof (arg_num) === "number" && arg_num >= 0) {

            compare = (p1, p2) => {
                const p1_max_index = p1.args.length - 1;
                const p2_max_index = p2.args.length - 1;

                const p1_index = Math.min(arg_num, p1_max_index);
                const p2_index = Math.min(arg_num, p2_max_index);

                return compare_general(p1.args[p1_index], p2.args[p2_index]);
            }
        } else { // Assume arg_num === "last"
            compare = (p1, p2) => {
                const p1_max_index = p1.args.length - 1;
                const p2_max_index = p2.args.length - 1;

                return compare_general(p1.args[p1_max_index], p2.args[p2_max_index]);
            }
        }

        for (let group of Object.values(grouped_preds)) { // Each group is a list of Predicate objects
            // Sort full strings first, to break any ties in a consistent way
            group.sort((a, b) => {
                const a_raw = a.raw_input;
                const b_raw = b.raw_input;
                if (a_raw < b_raw) return -1;
                if (a_raw > b_raw) return 1;
                return 0;
            });

            // Now stable sort as asked
            group.sort(compare);
        }
    }

    get_max_numargs() {
        return this.predicates.reduce((a, v) => Math.max(a, v.args.length), 0);
    }
}

export class GraphNode {
    value;
    outgoing;

    constructor(value) {
        this.value = value;
        this.outgoing = new Set([]);
    }

    add_outgoing(dest) {
        this.outgoing.add(dest);
    }

    delete_outgoing(dest) {
        this.outgoing.delete(dest);
    }
}

export class Graph {
    nodes;
    answer_set;
    edge_predicates;

    constructor(answer_set) {
        this.nodes = new Map([]);
        this.answer_set = answer_set;
        this.edge_predicates = answer_set.filter(["edge/2"]);

        for (let edge of this.edge_predicates) {
            const src = edge.args[0];
            const dest = edge.args[1];
            if (!this.nodes.has(src)) {
                this.nodes.set(src, new GraphNode(src));
            }
            if (!this.nodes.has(dest)) {
                this.nodes.set(dest, new GraphNode(dest));
            }
            this.nodes.get(src).add_outgoing(this.nodes.get(dest));
        }

        // console.log(this.nodes);
    }

    get_newick_notation(start_node = 'start') {
        const x = [];
        // newick notation for current node = (child1_notation, child2_notation, ...)current_node_value
        const current = this.nodes.get(start_node);
        // console.log(current);
        const child_notations = []
        for (const child of current.outgoing) {
            child_notations.push(this.get_newick_notation(child.value));
        }
        let notation = "";
        if (child_notations.length > 0) {
            notation = "(" + child_notations.join(",") + ")";
        }
        notation += current.value;
        return notation;
    }

    get_d3dag_notation() {
        // We want to compute incoming edges (parents) instead of outgoing
        const n = new Map([]);

        for (const [name, node] of this.nodes.entries()) {
            console.log("current", name);
            // for each child, add current node to its incoming
            for (const child of node.outgoing) {
                console.log("   ", child.value);
                if (!n.has(child.value)) {
                    n.set(child.value, []);
                }
                const child_incoming = n.get(child.value);
                child_incoming.push(name);
            }

            // Also add an entry for the current node, in case there aren't any incoming refs to it
            if (!n.has(name)) {
                n.set(name, []);
            }
        }

        const notation = [];

        for (const [name, incoming] of n) {
            const x = {};
            x['id'] = name;
            x['parentIds'] = incoming;
            notation.push(x);
        }

        console.log(notation);
        return notation;
    }
}