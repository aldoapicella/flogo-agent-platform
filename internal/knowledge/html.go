package knowledge

import (
	"strings"

	"golang.org/x/net/html"
)

func extractHTMLText(input string) string {
	doc, err := html.Parse(strings.NewReader(input))
	if err != nil {
		return input
	}

	var parts []string
	var walk func(*html.Node, bool)
	walk = func(node *html.Node, skip bool) {
		if node == nil {
			return
		}
		if node.Type == html.ElementNode {
			switch node.Data {
			case "script", "style", "noscript", "svg", "head":
				skip = true
			}
		}
		if !skip && node.Type == html.TextNode {
			text := normalizeWhitespace(node.Data)
			if text != "" {
				parts = append(parts, text)
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child, skip)
		}
	}
	walk(doc, false)
	return strings.Join(parts, "\n")
}

func normalizeWhitespace(text string) string {
	return strings.Join(strings.Fields(text), " ")
}
