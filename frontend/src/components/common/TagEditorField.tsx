'use client';

import TagEditor, { type TagEditorProps } from '@cloudscape-design/components/tag-editor';
import type { Tag } from '@/lib/types';

export function toEditorTags(tags: Tag[]): TagEditorProps.Tag[] {
  return tags.map(t => ({ key: t.key, value: t.value, existing: true }));
}

export function fromEditorTags(tags: ReadonlyArray<TagEditorProps.Tag>): Tag[] {
  return tags.filter(t => !t.markedForRemoval && t.key.trim()).map(t => ({ key: t.key.trim(), value: t.value }));
}

export function TagEditorField({
  tags,
  onChange,
}: {
  tags: ReadonlyArray<TagEditorProps.Tag>;
  onChange: (tags: ReadonlyArray<TagEditorProps.Tag>, valid: boolean) => void;
}) {
  return (
    <TagEditor
      tags={tags}
      onChange={e => onChange(e.detail.tags, e.detail.valid)}
      tagLimit={50}
      allowedCharacterPattern="^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$"
      i18nStrings={{
        keyPlaceholder: 'Enter key',
        valuePlaceholder: 'Enter value',
        addButton: 'Add tag',
        removeButton: 'Remove',
        undoButton: 'Undo',
        undoPrompt: 'This tag will be removed upon saving changes',
        loading: 'Loading tags that are associated with this resource',
        keyHeader: 'Key',
        valueHeader: 'Value - optional',
        optional: 'optional',
        keySuggestion: 'Custom tag key',
        valueSuggestion: 'Custom tag value',
        emptyTags: 'No tags associated with the resource.',
        tooManyKeysSuggestion: 'You have more keys than can be displayed',
        tooManyValuesSuggestion: 'You have more values than can be displayed',
        keysSuggestionLoading: 'Loading tag keys',
        keysSuggestionError: 'Tag keys could not be retrieved',
        valuesSuggestionLoading: 'Loading tag values',
        valuesSuggestionError: 'Tag values could not be retrieved',
        emptyKeyError: 'You must specify a tag key',
        maxKeyCharLengthError: 'The maximum number of characters you can use in a tag key is 128.',
        maxValueCharLengthError: 'The maximum number of characters you can use in a tag value is 256.',
        duplicateKeyError: 'You must specify a unique tag key.',
        invalidKeyError:
          'Invalid key. Keys can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-',
        invalidValueError:
          'Invalid value. Values can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-',
        awsPrefixError: 'Cannot start with aws:',
        tagLimit: (available, limit) =>
          available === limit
            ? `You can add up to ${limit} tags.`
            : available === 1
              ? 'You can add up to 1 more tag.'
              : `You can add up to ${available} more tags.`,
        tagLimitReached: limit => (limit === 1 ? 'You have reached the limit of 1 tag.' : `You have reached the limit of ${limit} tags.`),
        tagLimitExceeded: limit => (limit === 1 ? 'You have exceeded the limit of 1 tag.' : `You have exceeded the limit of ${limit} tags.`),
        enteredKeyLabel: key => `Use "${key}"`,
        enteredValueLabel: value => `Use "${value}"`,
      }}
    />
  );
}
