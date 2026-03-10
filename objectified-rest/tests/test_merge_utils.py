"""Tests for merge utility functions."""

from app.routes.merge_utils import (
    _class_snapshot_equals,
    merge_classes,
    merge_classes_three_way,
    merge_constraints,
    merge_property_lists,
)

# ---------------------------------------------------------------------------
# merge_constraints
# ---------------------------------------------------------------------------


class TestMergeConstraints:
    """Tests for merge_constraints."""

    def test_empty_inputs(self):
        merged, conflicts = merge_constraints({}, {})
        assert merged == {}
        assert conflicts == []

    def test_local_only_keys_kept(self):
        merged, conflicts = merge_constraints({"type": "string"}, {})
        assert merged == {"type": "string"}
        assert conflicts == []

    def test_remote_only_keys_added(self):
        merged, conflicts = merge_constraints({}, {"type": "string"})
        assert merged == {"type": "string"}
        assert conflicts == []

    def test_same_values_no_conflict(self):
        merged, conflicts = merge_constraints(
            {"type": "string", "minLength": 1},
            {"type": "string", "minLength": 1},
        )
        assert merged == {"type": "string", "minLength": 1}
        assert conflicts == []

    def test_minlength_takes_larger(self):
        merged, conflicts = merge_constraints(
            {"minLength": 2},
            {"minLength": 5},
        )
        assert merged["minLength"] == 5
        assert len(conflicts) == 1
        assert "stricter" in conflicts[0]["resolution"]

    def test_maxlength_takes_smaller(self):
        merged, conflicts = merge_constraints(
            {"maxLength": 100},
            {"maxLength": 50},
        )
        assert merged["maxLength"] == 50
        assert len(conflicts) == 1

    def test_minimum_takes_larger(self):
        merged, conflicts = merge_constraints(
            {"minimum": 0},
            {"minimum": 1},
        )
        assert merged["minimum"] == 1

    def test_maximum_takes_smaller(self):
        merged, conflicts = merge_constraints(
            {"maximum": 200},
            {"maximum": 150},
        )
        assert merged["maximum"] == 150

    def test_enum_union(self):
        merged, conflicts = merge_constraints(
            {"enum": ["a", "b"]},
            {"enum": ["b", "c"]},
        )
        assert set(merged["enum"]) == {"a", "b", "c"}
        assert len(conflicts) == 1
        assert "union" in conflicts[0]["resolution"]

    def test_enum_same_no_conflict(self):
        merged, conflicts = merge_constraints(
            {"enum": ["a", "b"]},
            {"enum": ["a", "b"]},
        )
        assert set(merged["enum"]) == {"a", "b"}
        assert conflicts == []

    def test_type_remote_wins(self):
        merged, conflicts = merge_constraints(
            {"type": "string"},
            {"type": "integer"},
        )
        assert merged["type"] == "integer"
        assert len(conflicts) == 1
        assert "remote wins" in conflicts[0]["resolution"]

    def test_nested_properties_merge(self):
        local = {
            "type": "object",
            "properties": {
                "name": {"type": "string", "minLength": 1},
            },
        }
        remote = {
            "type": "object",
            "properties": {
                "name": {"type": "string", "minLength": 3},
                "email": {"type": "string"},
            },
        }
        merged, conflicts = merge_constraints(local, remote)
        assert "email" in merged["properties"]
        assert merged["properties"]["name"]["minLength"] == 3

    def test_items_merge(self):
        local = {"type": "array", "items": {"type": "string", "minLength": 2}}
        remote = {"type": "array", "items": {"type": "string", "minLength": 5}}
        merged, conflicts = merge_constraints(local, remote)
        assert merged["items"]["minLength"] == 5

    def test_default_remote_wins_for_unknown_keys(self):
        merged, conflicts = merge_constraints(
            {"format": "date"},
            {"format": "date-time"},
        )
        assert merged["format"] == "date-time"
        assert len(conflicts) == 1


# ---------------------------------------------------------------------------
# merge_property_lists
# ---------------------------------------------------------------------------


class TestMergePropertyLists:
    """Tests for merge_property_lists."""

    def test_empty_lists(self):
        merged, conflicts = merge_property_lists([], [], "additive")
        assert merged == []
        assert conflicts == []

    def test_additive_keeps_local(self):
        local = [{"name": "age", "data": {"type": "integer"}}]
        remote = [{"name": "age", "data": {"type": "string"}}]
        merged, conflicts = merge_property_lists(local, remote, "additive")
        assert len(merged) == 1
        assert merged[0]["data"]["type"] == "integer"  # local kept
        assert conflicts == []

    def test_additive_adds_remote_only(self):
        local = [{"name": "age", "data": {"type": "integer"}}]
        remote = [{"name": "email", "data": {"type": "string"}}]
        merged, conflicts = merge_property_lists(local, remote, "additive")
        assert len(merged) == 2
        names = {p["name"] for p in merged}
        assert names == {"age", "email"}

    def test_override_merges_constraints(self):
        local = [{"name": "age", "data": {"type": "integer", "minimum": 0}}]
        remote = [{"name": "age", "data": {"type": "integer", "minimum": 1}}]
        merged, conflicts = merge_property_lists(local, remote, "override")
        assert len(merged) == 1
        assert merged[0]["data"]["minimum"] == 1  # stricter wins
        assert len(conflicts) >= 1

    def test_override_updates_description(self):
        local = [{"name": "age", "description": "Old desc", "data": {}}]
        remote = [{"name": "age", "description": "New desc", "data": {}}]
        merged, conflicts = merge_property_lists(local, remote, "override")
        assert merged[0]["description"] == "New desc"

    def test_case_insensitive_matching(self):
        local = [{"name": "Age", "data": {"type": "integer"}}]
        remote = [{"name": "age", "data": {"type": "integer"}}]
        merged, conflicts = merge_property_lists(local, remote, "additive")
        assert len(merged) == 1  # Matched by case-insensitive name


# ---------------------------------------------------------------------------
# merge_classes
# ---------------------------------------------------------------------------


class TestMergeClasses:
    """Tests for merge_classes."""

    def test_empty_lists(self):
        merged, conflicts = merge_classes([], [], "additive")
        assert merged == []
        assert conflicts == []

    def test_additive_adds_remote_only_classes(self):
        local = [{"name": "Person", "properties": []}]
        remote = [{"name": "Address", "properties": []}]
        merged, conflicts = merge_classes(local, remote, "additive")
        assert len(merged) == 2
        names = {c["name"] for c in merged}
        assert names == {"Person", "Address"}
        assert conflicts == []

    def test_additive_keeps_local_class_metadata(self):
        local = [{"name": "Person", "description": "Local", "properties": []}]
        remote = [{"name": "Person", "description": "Remote", "properties": []}]
        merged, conflicts = merge_classes(local, remote, "additive")
        assert len(merged) == 1
        assert merged[0]["description"] == "Local"

    def test_override_remote_wins_description(self):
        local = [{"name": "Person", "description": "Local", "properties": []}]
        remote = [{"name": "Person", "description": "Remote", "properties": []}]
        merged, conflicts = merge_classes(local, remote, "override")
        assert len(merged) == 1
        assert merged[0]["description"] == "Remote"
        assert len(conflicts) >= 1

    def test_override_merges_metadata(self):
        local = [{"name": "Person", "metadata": {"a": 1}, "properties": []}]
        remote = [{"name": "Person", "metadata": {"b": 2}, "properties": []}]
        merged, conflicts = merge_classes(local, remote, "override")
        assert merged[0]["metadata"] == {"a": 1, "b": 2}

    def test_override_merges_properties(self):
        local = [
            {
                "name": "Person",
                "properties": [
                    {"name": "age", "data": {"type": "integer", "minimum": 0}},
                ],
            }
        ]
        remote = [
            {
                "name": "Person",
                "properties": [
                    {"name": "age", "data": {"type": "integer", "minimum": 1}},
                    {"name": "email", "data": {"type": "string"}},
                ],
            }
        ]
        merged, conflicts = merge_classes(local, remote, "override")
        assert len(merged) == 1
        props = merged[0]["properties"]
        assert len(props) == 2
        age_prop = next(p for p in props if p["name"] == "age")
        assert age_prop["data"]["minimum"] == 1

    def test_case_insensitive_class_matching(self):
        local = [{"name": "Person", "properties": []}]
        remote = [{"name": "person", "properties": []}]
        merged, conflicts = merge_classes(local, remote, "additive")
        assert len(merged) == 1  # Matched

    def test_additive_adds_remote_only_properties_to_existing_class(self):
        local = [
            {
                "name": "Person",
                "properties": [{"name": "age", "data": {"type": "integer"}}],
            }
        ]
        remote = [
            {
                "name": "Person",
                "properties": [{"name": "email", "data": {"type": "string"}}],
            }
        ]
        merged, conflicts = merge_classes(local, remote, "additive")
        assert len(merged) == 1
        props = merged[0]["properties"]
        assert len(props) == 2
        names = {p["name"] for p in props}
        assert names == {"age", "email"}


# ---------------------------------------------------------------------------
# merge_classes_three_way
# ---------------------------------------------------------------------------


class TestMergeClassesThreeWay:
    """Tests for merge_classes_three_way."""

    def _cls(self, name, description="", properties=None, schema=None, metadata=None):
        return {
            "name": name,
            "description": description,
            "properties": properties or [],
            "schema": schema or {},
            "metadata": metadata or {},
        }

    # --- only-ours changed ---

    def test_only_ours_changed_takes_ours(self):
        base = [self._cls("Person", "Base desc")]
        ours = [self._cls("Person", "Ours desc")]
        theirs = [self._cls("Person", "Base desc")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 1
        assert merged[0]["description"] == "Ours desc"
        assert conflicts == []

    def test_only_theirs_changed_takes_theirs(self):
        base = [self._cls("Person", "Base desc")]
        ours = [self._cls("Person", "Base desc")]
        theirs = [self._cls("Person", "Theirs desc")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 1
        assert merged[0]["description"] == "Theirs desc"
        assert conflicts == []

    def test_neither_changed_takes_ours(self):
        base = [self._cls("Person", "Same desc")]
        ours = [self._cls("Person", "Same desc")]
        theirs = [self._cls("Person", "Same desc")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 1
        assert merged[0]["description"] == "Same desc"
        assert conflicts == []

    # --- both changed (conflict / two-way fallback) ---

    def test_both_changed_falls_back_to_two_way_override(self):
        base = [self._cls("Person", "Base")]
        ours = [self._cls("Person", "Ours")]
        theirs = [self._cls("Person", "Theirs")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "override")
        assert len(merged) == 1
        # override: remote (theirs) wins description
        assert merged[0]["description"] == "Theirs"
        assert len(conflicts) >= 1

    def test_both_changed_falls_back_to_two_way_additive(self):
        base = [self._cls("Person", "Base")]
        ours = [self._cls("Person", "Ours")]
        theirs = [self._cls("Person", "Theirs")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 1
        # additive: local (ours) wins description
        assert merged[0]["description"] == "Ours"

    # --- class added / deleted in one side ---

    def test_class_added_in_ours_only(self):
        base = []
        ours = [self._cls("NewClass")]
        theirs = []
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 1
        assert merged[0]["name"] == "NewClass"
        assert conflicts == []

    def test_class_added_in_theirs_only(self):
        base = []
        ours = []
        theirs = [self._cls("NewClass")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 1
        assert merged[0]["name"] == "NewClass"
        assert conflicts == []

    def test_class_added_in_both_merges(self):
        base = []
        ours = [self._cls("NewClass", "Ours")]
        theirs = [self._cls("NewClass", "Theirs")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 1

    def test_class_deleted_in_ours(self):
        base = [self._cls("Person")]
        ours = []
        theirs = [self._cls("Person")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        # theirs still has it → included
        assert len(merged) == 1
        assert merged[0]["name"] == "Person"

    def test_class_deleted_in_theirs(self):
        base = [self._cls("Person")]
        ours = [self._cls("Person")]
        theirs = []
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        # ours still has it → included
        assert len(merged) == 1
        assert merged[0]["name"] == "Person"

    def test_class_deleted_in_both(self):
        base = [self._cls("Person")]
        ours = []
        theirs = []
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 0

    # --- schema / metadata equality checks ---

    def test_only_schema_changed_in_ours(self):
        base = [self._cls("Obj", schema={"x": 1})]
        ours = [self._cls("Obj", schema={"x": 2})]
        theirs = [self._cls("Obj", schema={"x": 1})]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert merged[0]["schema"] == {"x": 2}
        assert conflicts == []

    def test_only_metadata_changed_in_theirs(self):
        base = [self._cls("Obj", metadata={"color": "red"})]
        ours = [self._cls("Obj", metadata={"color": "red"})]
        theirs = [self._cls("Obj", metadata={"color": "blue"})]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert merged[0]["metadata"] == {"color": "blue"}
        assert conflicts == []

    def test_schema_and_metadata_both_changed_conflict(self):
        base = [self._cls("Obj", schema={"x": 1}, metadata={"color": "red"})]
        ours = [self._cls("Obj", schema={"x": 2}, metadata={"color": "red"})]
        theirs = [self._cls("Obj", schema={"x": 1}, metadata={"color": "blue"})]
        # ours changed schema, theirs changed metadata → both differ from base → two-way merge
        merged, _conflicts = merge_classes_three_way(base, ours, theirs, "override")
        assert len(merged) == 1

    # --- multiple classes ---

    def test_multiple_classes_independent(self):
        base = [self._cls("A", "a-base"), self._cls("B", "b-base")]
        ours = [self._cls("A", "a-ours"), self._cls("B", "b-base")]
        theirs = [self._cls("A", "a-base"), self._cls("B", "b-theirs")]
        merged, conflicts = merge_classes_three_way(base, ours, theirs, "additive")
        assert len(merged) == 2
        a = next(c for c in merged if c["name"] == "A")
        b = next(c for c in merged if c["name"] == "B")
        assert a["description"] == "a-ours"
        assert b["description"] == "b-theirs"
        assert conflicts == []


# ---------------------------------------------------------------------------
# _class_snapshot_equals and _prop_snapshot_equals
# ---------------------------------------------------------------------------


class TestClassSnapshotEquals:
    """Tests for _class_snapshot_equals and _prop_snapshot_equals."""

    def _cls(self, name, description="", properties=None, schema=None, metadata=None):
        return {
            "name": name,
            "description": description,
            "properties": properties or [],
            "schema": schema or {},
            "metadata": metadata or {},
        }

    def test_identical_classes_equal(self):
        a = self._cls("Person", "desc", [{"name": "age", "data": {"type": "integer"}, "description": ""}])
        b = self._cls("Person", "desc", [{"name": "age", "data": {"type": "integer"}, "description": ""}])
        assert _class_snapshot_equals(a, b) is True

    def test_different_description_not_equal(self):
        a = self._cls("Person", "A")
        b = self._cls("Person", "B")
        assert _class_snapshot_equals(a, b) is False

    def test_different_schema_not_equal(self):
        a = self._cls("Person", schema={"x": 1})
        b = self._cls("Person", schema={"x": 2})
        assert _class_snapshot_equals(a, b) is False

    def test_different_metadata_not_equal(self):
        a = self._cls("Person", metadata={"color": "red"})
        b = self._cls("Person", metadata={"color": "blue"})
        assert _class_snapshot_equals(a, b) is False

    def test_different_property_count_not_equal(self):
        a = self._cls("Person", properties=[{"name": "age", "data": {}}])
        b = self._cls("Person", properties=[])
        assert _class_snapshot_equals(a, b) is False

    def test_case_insensitive_name_match(self):
        a = self._cls("Person")
        b = self._cls("person")
        assert _class_snapshot_equals(a, b) is True


