package domain

import (
	"fmt"
	"reflect"
	"strings"
)

const maxConditionDepth = 8

var supportedConditionOperators = map[string]bool{
	"equals":             true,
	"notEquals":          true,
	"in":                 true,
	"notIn":              true,
	"exists":             true,
	"notExists":          true,
	"greaterThan":        true,
	"greaterThanOrEqual": true,
	"lessThan":           true,
	"lessThanOrEqual":    true,
}

// ConditionExpression is a deliberately small, serializable DSL. A node is
// either a leaf (field/operator/value), an all group, or an any group. It is
// interpreted by both the backend and frontend; arbitrary executable code is
// never stored in a catalog definition.
type ConditionExpression struct {
	Field    string                `json:"field,omitempty"`
	Operator string                `json:"operator,omitempty"`
	Value    any                   `json:"value,omitempty"`
	Values   []any                 `json:"values,omitempty"`
	All      []ConditionExpression `json:"all,omitempty"`
	Any      []ConditionExpression `json:"any,omitempty"`
}

func (condition ConditionExpression) Validate(
	fields map[string]bool,
	targetField string,
) error {
	return condition.validate(fields, targetField, 0)
}

func (condition ConditionExpression) validate(
	fields map[string]bool,
	targetField string,
	depth int,
) error {
	if depth > maxConditionDepth {
		return fmt.Errorf("%w: condition exceeds maximum depth", ErrInvalidDefinition)
	}
	hasLeaf := condition.Field != "" || condition.Operator != ""
	hasAll := len(condition.All) > 0
	hasAny := len(condition.Any) > 0
	kinds := 0
	for _, present := range []bool{hasLeaf, hasAll, hasAny} {
		if present {
			kinds++
		}
	}
	if kinds != 1 {
		return fmt.Errorf(
			"%w: condition must contain exactly one leaf, all group, or any group",
			ErrInvalidDefinition,
		)
	}
	if hasAll || hasAny {
		children := condition.All
		if hasAny {
			children = condition.Any
		}
		for _, child := range children {
			if err := child.validate(fields, targetField, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if !fields[condition.Field] {
		return fmt.Errorf(
			"%w: condition references unknown field %q",
			ErrInvalidDefinition,
			condition.Field,
		)
	}
	if condition.Field == targetField {
		return fmt.Errorf(
			"%w: field %q cannot depend on itself",
			ErrInvalidDefinition,
			targetField,
		)
	}
	if !supportedConditionOperators[condition.Operator] {
		return fmt.Errorf(
			"%w: condition has unsupported operator %q",
			ErrInvalidDefinition,
			condition.Operator,
		)
	}
	if (condition.Operator == "in" || condition.Operator == "notIn") &&
		len(condition.Values) == 0 {
		return fmt.Errorf(
			"%w: operator %q requires values",
			ErrInvalidDefinition,
			condition.Operator,
		)
	}
	if condition.Operator != "in" && condition.Operator != "notIn" &&
		condition.Operator != "exists" && condition.Operator != "notExists" &&
		condition.Value == nil {
		return fmt.Errorf(
			"%w: operator %q requires a value",
			ErrInvalidDefinition,
			condition.Operator,
		)
	}
	return nil
}

func (condition ConditionExpression) Matches(data map[string]any) bool {
	if len(condition.All) > 0 {
		for _, child := range condition.All {
			if !child.Matches(data) {
				return false
			}
		}
		return true
	}
	if len(condition.Any) > 0 {
		for _, child := range condition.Any {
			if child.Matches(data) {
				return true
			}
		}
		return false
	}
	actual, exists := conditionValue(data, condition.Field)
	present := exists && !isEmptyValue(actual)
	switch condition.Operator {
	case "exists":
		return present
	case "notExists":
		return !present
	case "equals":
		return valuesEqual(actual, condition.Value)
	case "notEquals":
		return !valuesEqual(actual, condition.Value)
	case "in", "notIn":
		found := false
		for _, candidate := range condition.Values {
			if valuesEqual(actual, candidate) {
				found = true
				break
			}
		}
		if condition.Operator == "notIn" {
			return !found
		}
		return found
	case "greaterThan", "greaterThanOrEqual", "lessThan", "lessThanOrEqual":
		left, leftOK := numericValue(actual)
		right, rightOK := numericValue(condition.Value)
		if !leftOK || !rightOK {
			return false
		}
		switch condition.Operator {
		case "greaterThan":
			return left > right
		case "greaterThanOrEqual":
			return left >= right
		case "lessThan":
			return left < right
		default:
			return left <= right
		}
	default:
		return false
	}
}

func conditionValue(data map[string]any, path string) (any, bool) {
	if value, exists := data[path]; exists {
		return value, true
	}
	parts := strings.Split(path, ".")
	var current any = data
	for _, part := range parts {
		object, ok := current.(map[string]any)
		if !ok {
			return nil, false
		}
		current, ok = object[part]
		if !ok {
			return nil, false
		}
	}
	return current, true
}

func valuesEqual(left, right any) bool {
	if leftNumber, ok := numericValue(left); ok {
		if rightNumber, rightOK := numericValue(right); rightOK {
			return leftNumber == rightNumber
		}
	}
	return reflect.DeepEqual(left, right)
}

func numericValue(value any) (float64, bool) {
	switch number := value.(type) {
	case float64:
		return number, true
	case float32:
		return float64(number), true
	case int:
		return float64(number), true
	case int8:
		return float64(number), true
	case int16:
		return float64(number), true
	case int32:
		return float64(number), true
	case int64:
		return float64(number), true
	case uint:
		return float64(number), true
	case uint8:
		return float64(number), true
	case uint16:
		return float64(number), true
	case uint32:
		return float64(number), true
	case uint64:
		return float64(number), true
	default:
		return 0, false
	}
}

func isEmptyValue(value any) bool {
	if value == nil {
		return true
	}
	text, ok := value.(string)
	return ok && strings.TrimSpace(text) == ""
}
