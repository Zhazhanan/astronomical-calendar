import unittest
from html.parser import HTMLParser
from pathlib import Path
import re


class ElementIdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = {}
        self.id_counts = {}
        self.form_controls = []
        self.headings = []
        self.open_elements = []
        self.alert_depths = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self.elements[element_id] = (tag, attributes)
            self.id_counts[element_id] = self.id_counts.get(element_id, 0) + 1
        if tag in ("input", "select", "textarea"):
            self.form_controls.append((tag, attributes, any(parent_tag == "label" for parent_tag, _ in self.open_elements)))
        if re.fullmatch(r"h[1-6]", tag):
            self.headings.append(int(tag[1]))
        if attributes.get("role") == "alert":
            self.alert_depths.append(sum(1 for _, parent_attrs in self.open_elements if parent_attrs.get("role") == "alert"))
        self.open_elements.append((tag, attributes))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.open_elements) - 1, -1, -1):
            if self.open_elements[index][0] == tag:
                del self.open_elements[index:]
                return


class OfflinePageControlsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        page = Path(__file__).parents[1] / "tiangan_dizhi_offline.html"
        cls.parser = ElementIdParser()
        cls.html = page.read_text(encoding="utf-8")
        cls.parser.feed(cls.html)

    def test_keeps_visualization_controls_without_jiazi_table_export(self):
        self.assertIn("showJiazi", self.parser.elements)
        self.assertIn("snapBtn", self.parser.elements)
        self.assertNotIn("ganzhiTable", self.parser.elements)
        self.assertNotIn("exportJiazi", self.parser.elements)

    def test_exposes_solar_longitude_angle_control_and_readout(self):
        self.assertIn("showSolarAngle", self.parser.elements)
        self.assertIn("solarAngleValue", self.parser.elements)

    def test_uses_world_state_for_solar_angle_display(self):
        self.assertIn('js/astronomy-core.js', self.html)
        self.assertIn('js/world-state.js', self.html)
        self.assertNotIn('id="solar-angle-core"', self.html)
        self.assertNotIn('function solarLongitudePrecise', self.html)

    def test_loads_the_synchronized_dual_scene_application(self):
        self.assertEqual(self.html.count('id="astronomyCanvas"'), 1)
        self.assertIn('id="heliocentricViewport"', self.html)
        self.assertIn('id="geocentricViewport"', self.html)
        self.assertIn('js/scene-host.js', self.html)
        self.assertIn('js/heliocentric-scene.js', self.html)
        self.assertIn('js/geocentric-scene.js', self.html)
        self.assertIn('js/app.js', self.html)
        self.assertIn("AstroEducation.App.start()", self.html)

    def test_has_no_legacy_mixed_scene_or_spatial_jiazi_renderer(self):
        for marker in ('createJiaZiLines', 'simplifiedMoon', 'new THREE.WebGLRenderer', 'requestAnimationFrame(animate)', 'canvasContainer'):
            self.assertNotIn(marker, self.html)

    def test_exposes_the_b1_learning_page_landmarks_and_controls(self):
        required_ids = [
            'timeControls', 'dateTimeInput', 'todayButton', 'previousDayButton',
            'nextDayButton', 'playPauseButton', 'speedSelect', 'timeZoneSelect',
            'locationSelect', 'latitudeInput', 'longitudeInput', 'sceneTabs',
            'annualTimeline', 'knowledgeCards', 'advancedAstronomy', 'pageStatus'
        ]
        for element_id in required_ids:
            self.assertEqual(self.html.count(f'id="{element_id}"'), 1)
        self.assertIn('styles/astronomy-education.css', self.html)
        self.assertIn('aria-live="polite"', self.html)
        self.assertIn('<main', self.html)
        self.assertIn('<details id="advancedAstronomy"', self.html)

    def test_declares_the_shared_responsive_breakpoint_contract(self):
        stylesheet = (Path(__file__).parents[1] / "styles" / "astronomy-education.css").read_text(encoding="utf-8")
        self.assertRegex(stylesheet, r'@media\s*\(min-width:\s*1025px\)')
        self.assertRegex(stylesheet, r'@media\s*\(min-width:\s*601px\)\s*and\s*\(max-width:\s*1024px\)')
        self.assertRegex(stylesheet, r'@media\s*\(max-width:\s*600px\)')
        for required in ('min-height:44px', ':focus-visible', 'prefers-reduced-motion', 'aspect-ratio', 'overflow-x:auto'):
            self.assertIn(required, stylesheet)

    def test_exposes_accessible_learning_controls_and_offline_resources(self):
        self.assertEqual(self.html.count('aria-live="polite"'), 1)
        self.assertEqual(len(re.findall(r'aria-live=', self.html)), 1)
        for element_id in ('todayButton', 'previousDayButton', 'nextDayButton', 'playPauseButton'):
            self.assertEqual(self.parser.elements[element_id][1].get('type'), 'button')
        self.assertRegex(self.html, r'<select id="speedSelect"[^>]*>.*value="1".*value="7".*value="30"')
        self.assertIn('1 天/秒', self.html)
        self.assertIn('7 天/秒', self.html)
        self.assertIn('30 天/秒', self.html)
        self.assertIn('Asia/Shanghai', self.html)
        self.assertIn('value="local"', self.html)
        self.assertIn('id="resolvedTimeZone"', self.html)
        self.assertIn('value="custom"', self.html)
        self.assertIn('disabled', self.parser.elements['latitudeInput'][1])
        self.assertIn('disabled', self.parser.elements['longitudeInput'][1])
        self.assertEqual(self.parser.elements['sceneTabs'][0], 'nav')
        self.assertNotRegex(self.html, r'<(?:script|link)[^>]+https?://')
        self.assertNotIn('<style', self.html)
        self.assertNotIn('style="', self.html)

    def test_static_accessibility_basics_are_kept_in_the_source_markup(self):
        self.assertTrue(self.parser.id_counts)
        self.assertTrue(all(count == 1 for count in self.parser.id_counts.values()))
        self.assertEqual(self.parser.headings[0], 1)
        self.assertTrue(all(next_level <= level + 1 for level, next_level in zip(self.parser.headings, self.parser.headings[1:])))
        for tag, attributes, is_wrapped_by_label in self.parser.form_controls:
            self.assertTrue(
                is_wrapped_by_label or attributes.get("aria-label") or attributes.get("aria-labelledby"),
                f"{tag}#{attributes.get('id', '(no id)')} needs a label or accessible name"
            )
        self.assertNotRegex(self.html, r'tabindex\s*=\s*["\']?[1-9]')
        self.assertEqual(self.html.count('aria-live="polite"'), 1)
        self.assertEqual(len(self.parser.alert_depths), 0)
        self.assertFalse(any(depth > 0 for depth in self.parser.alert_depths))

    def test_runtime_timeline_range_has_an_accessible_name(self):
        panel_script = (Path(__file__).parents[1] / "js" / "education-panel.js").read_text(encoding="utf-8")
        self.assertRegex(panel_script, r"scrub\.type\s*=\s*['\"]range['\"]")
        self.assertRegex(panel_script, r"scrub\.setAttribute\(\s*['\"]aria-label['\"]")

    def test_scene_switcher_uses_standard_tab_semantics(self):
        tabs = self.parser.elements["sceneTabs"]
        self.assertEqual(tabs[0], "nav")
        self.assertEqual(tabs[1].get("role"), "tablist")
        expected = {
            "heliocentricSceneBtn": ("heliocentricViewport", "true"),
            "geocentricSceneBtn": ("geocentricViewport", "false"),
        }
        for element_id, (controlled_id, selected) in expected.items():
            attributes = self.parser.elements[element_id][1]
            self.assertEqual(attributes.get("role"), "tab")
            self.assertEqual(attributes.get("aria-controls"), controlled_id)
            self.assertEqual(attributes.get("aria-selected"), selected)
            viewport = self.parser.elements[controlled_id][1]
            self.assertEqual(viewport.get("role"), "tabpanel")
            self.assertEqual(viewport.get("aria-labelledby"), element_id)

    def test_reduced_motion_and_runtime_resource_rules_are_static(self):
        stylesheet = (Path(__file__).parents[1] / "styles" / "astronomy-education.css").read_text(encoding="utf-8")
        self.assertIn("@media (prefers-reduced-motion:reduce)", stylesheet)
        self.assertNotRegex(self.html, r'<(?:script|link)\b[^>]+(?:src|href)=["\']https?://')
        self.assertNotRegex(self.html, r'<(?:script|link)\b[^>]+(?:src|href)=["\']data:')

    def test_knowledge_cards_are_keyboard_collapsible_with_stable_bodies(self):
        cards = re.findall(r'<details class="knowledge-card"([^>]*)>(.*?)</details>', self.html, re.S)
        self.assertEqual(len(cards), 6)
        self.assertEqual(sum('open' in attributes.split() for attributes, _ in cards), 2)
        for attributes, content in cards:
            self.assertIn('<summary>', content)
            self.assertRegex(attributes, r'data-card="[a-z-]+"')
            self.assertRegex(content, r'<div id="[a-zA-Z]+CardBody" class="knowledge-card-body">')

    def test_advanced_astronomy_uses_local_csv_only(self):
        self.assertNotIn('id="fetchStarsBtn"', self.html)
        self.assertNotIn('fetch(', self.html)
        self.assertIn('accept=".csv,text/csv"', self.html)
        self.assertIn('js/star-catalog.js', self.html)
        self.assertIn('传统星官示意', self.html)

    def test_fallback_hides_only_three_dimensional_actions_outside_the_scene_grid(self):
        stylesheet = (Path(__file__).parents[1] / "styles" / "astronomy-education.css").read_text(encoding="utf-8")
        self.assertRegex(stylesheet, r'body\.fallback-active[^\{]*#sceneTabs[^\{]*\.scene-actions[^\{]*\.layer-controls[^\{]*\{display:none\}')
        self.assertIn('id="annualTimeline"', self.html)
        self.assertIn('id="knowledgeCards"', self.html)
        self.assertIn('id="advancedCatalogInput"', self.html)


if __name__ == "__main__":
    unittest.main()
