import unittest
from html.parser import HTMLParser
from pathlib import Path
import re


class ElementIdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = {}

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        element_id = attributes.get("id")
        if element_id:
            self.elements[element_id] = (tag, attributes)


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

    def test_knowledge_cards_are_keyboard_collapsible_with_stable_bodies(self):
        cards = re.findall(r'<details class="knowledge-card"([^>]*)>(.*?)</details>', self.html, re.S)
        self.assertEqual(len(cards), 6)
        self.assertEqual(sum('open' in attributes.split() for attributes, _ in cards), 2)
        for attributes, content in cards:
            self.assertIn('<summary>', content)
            self.assertRegex(attributes, r'data-card="[a-z-]+"')
            self.assertRegex(content, r'<div id="[a-zA-Z]+CardBody" class="knowledge-card-body">')


if __name__ == "__main__":
    unittest.main()
