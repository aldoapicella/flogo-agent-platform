package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type response struct {
	Command string         `json:"command"`
	Status  string         `json:"status"`
	Data    map[string]any `json:"data"`
}

func main() {
	if len(os.Args) < 3 {
		fail("expected a command such as 'catalog contribs', 'inspect descriptor', or 'preview mapping'")
	}

	command := strings.Join(os.Args[1:3], " ")
	var payload response

	switch command {
	case "catalog contribs":
		payload = response{
			Command: command,
			Status:  "stub",
			Data: map[string]any{
				"entries": []any{},
				"note":    "Go helper scaffold is present; Core-backed contrib introspection will be implemented on top of this command.",
			},
		}
	case "inspect descriptor":
		payload = response{
			Command: command,
			Status:  "stub",
			Data: map[string]any{
				"ref":  lookupFlag("--ref"),
				"note": "Descriptor inspection scaffold is present; Core-backed descriptor loading will be implemented here.",
			},
		}
	case "preview mapping":
		payload = response{
			Command: command,
			Status:  "stub",
			Data: map[string]any{
				"nodeId": lookupFlag("--node"),
				"note":   "Mapping preview scaffold is present; Flow/runtime-backed resolution will be implemented here.",
			},
		}
	default:
		fail(fmt.Sprintf("unsupported command %q", command))
	}

	encode(payload)
}

func lookupFlag(name string) string {
	for index := 3; index < len(os.Args); index++ {
		if os.Args[index] == name && index+1 < len(os.Args) {
			return os.Args[index+1]
		}
	}
	return ""
}

func encode(value response) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		fail(err.Error())
	}
}

func fail(message string) {
	_, _ = fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
