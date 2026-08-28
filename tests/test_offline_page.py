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
        cls.parser.feed(page.read_text(encoding="utf-8"))

    def test_keeps_visualization_controls_without_jiazi_table_export(self):
        self.assertIn("showJiazi", self.parser.elements)
        self.assertIn("snapBtn", self.parser.elements)
        self.assertNotIn("ganzhiTable", self.parser.elements)
        self.assertNotIn("exportJiazi", self.parser.elements)


if __name__ == "__main__":
    unittest.main()
