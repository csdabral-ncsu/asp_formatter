import { MDCTopAppBar } from '@material/top-app-bar/index';
import { MDCDrawer } from "@material/drawer/index";
import {MDCTextField} from '@material/textfield';
// import { MDCRipple } from "@material/ripple/index";

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