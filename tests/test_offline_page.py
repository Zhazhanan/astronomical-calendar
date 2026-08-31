import unittest
from html.parser import HTMLParser
from pathlib import Path


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

    def test_uses_world_state_moon_position_without_wall_clock_orbit(self):
        self.assertIn('worldState.moon.positionKm', self.html)
        self.assertIn('rotateCanonicalVectorToDisplay(moonPositionKm, obliquity)', self.html)
        self.assertNotIn('performance.now() * s.speed', self.html)


if __name__ == "__main__":
    unittest.main()
