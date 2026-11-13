import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { RAIL_BREAKPOINT, colors, fonts, gutter, rule, type } from './theme';

type TypeProps = TextProps & { inverse?: boolean; style?: StyleProp<TextStyle> };

function tone(inverse?: boolean) {
  return { color: inverse ? colors.ground : colors.ink };
}

/** Plain small index label: tracked capitals. */
export function Label({ inverse, style, ...props }: TypeProps) {
  return <Text {...props} style={[styles.label, tone(inverse), style]} />;
}

export function Meta({ inverse, style, ...props }: TypeProps) {
  return <Text {...props} style={[styles.meta, tone(inverse), style]} />;
}

export function Body({ inverse, style, ...props }: TypeProps) {
  return <Text {...props} style={[styles.body, tone(inverse), style]} />;
}

export function Lead({ inverse, style, ...props }: TypeProps) {
  return <Text {...props} style={[styles.lead, tone(inverse), style]} />;
}

export function ItemTitle({ inverse, style, ...props }: TypeProps) {
  return <Text accessibilityRole="header" {...props} style={[styles.itemTitle, tone(inverse), style]} />;
}

/** Heavy, tightly tracked, close-set heading, padded below for descenders. */
export function Display({ inverse, size, style, ...props }: TypeProps & { size: number }) {
  return (
    <Text
      accessibilityRole="header"
      {...props}
      style={[styles.display, { fontSize: size, lineHeight: Math.round(size * 0.92), letterSpacing: -size * 0.045, paddingBottom: Math.round(size * 0.12) }, tone(inverse), style]}
    />
  );
}

export function Rule({ inverse, style }: { inverse?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: rule, backgroundColor: inverse ? colors.ground : colors.ink }, style]} />;
}

/** Small red square for priority. Always paired with text, never the only cue. */
export function Marker({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.marker, style]} />;
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'inverse';
  disabled?: boolean;
  trailing?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** Rectangular control with direct black/white states and a visible focus outline. */
export function Button({ label, onPress, variant = 'primary', disabled, trailing = '→', accessibilityHint, style }: ButtonProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.focusRing, focused && styles.focusRingOn, style]}
    >
      {({ pressed }) => {
        // Primary is black, secondary white, inverse a white outline on a black field.
        // Pressing swaps ink and ground; disabled drops to the pale grey surface.
        const dark = variant === 'secondary' ? pressed : !pressed;
        const [background, foreground] = disabled ? [colors.surface, colors.ink]
          : dark ? [colors.ink, colors.ground] : [colors.ground, colors.ink];
        return (
          <View style={[styles.button, { backgroundColor: background, borderColor: variant === 'inverse' ? colors.ground : colors.ink }]}>
            <Text style={[styles.buttonText, { color: foreground }]}>{label}</Text>
            {!!trailing && <Text style={[styles.buttonText, { color: foreground }]}>{trailing}</Text>}
          </View>
        );
      }}
    </Pressable>
  );
}

/** Full-width ruled row that opens something: a list entry or a link. */
export function RowLink({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress: () => void; accessibilityLabel: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.focusRing, focused && styles.focusRingOn]}
    >
      {({ pressed }) => (
        <View style={[styles.row, pressed && styles.rowPressed]}>
          <View style={styles.rowContent}>{children}</View>
          <Text style={styles.rowArrow}>→</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Screen header: square back control, index label, and an optional action. */
export function TopBar({ title, onBack, backLabel = 'Back', right }: { title: string; onBack?: () => void; backLabel?: string; right?: ReactNode }) {
  const { width } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={[styles.topBar, { paddingHorizontal: gutter(width) }]}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            hitSlop={6}
            style={[styles.focusRing, focused && styles.focusRingOn]}
          >
            {({ pressed }) => (
              <View style={[styles.backButton, pressed && styles.backPressed]}>
                <Text style={[styles.backText, pressed && { color: colors.ground }]}>←</Text>
              </View>
            )}
          </Pressable>
        ) : null}
        <Label style={styles.topTitle} numberOfLines={1}>{title}</Label>
        {right}
      </View>
      <Rule />
    </View>
  );
}

/** Underlined inline text control. */
export function TextLink({ label, onPress, inverse }: { label: string; onPress: () => void; inverse?: boolean }) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={8}
      style={[styles.focusRing, focused && styles.focusRingOn, styles.textLink]}
    >
      {({ pressed }) => <Text style={[styles.meta, styles.underline, tone(inverse), pressed && styles.pressedText]}>{label}</Text>}
    </Pressable>
  );
}

/**
 * Section with an index rail: number and title. The rail takes the first three of
 * twelve columns at 700px and wider and sits above the content on narrower screens.
 */
export function Section({ index, title, children, inverse, surface, accent }: {
  index: string;
  title: string;
  children: ReactNode;
  inverse?: boolean;
  surface?: boolean;
  accent?: boolean;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= RAIL_BREAKPOINT;
  const pad = gutter(width);
  const background = inverse ? colors.ink : surface ? colors.surface : colors.ground;
  return (
    <View style={{ backgroundColor: background }}>
      <Rule inverse={inverse} />
      <View style={[{ paddingHorizontal: pad, paddingTop: 16, paddingBottom: 28 }, wide && styles.sectionWide]}>
        <View style={[styles.rail, wide && styles.railWide]}>
          {accent && <Marker style={styles.railMarker} />}
          <Label inverse={inverse}>{index}</Label>
          <Label inverse={inverse} style={styles.railTitle}>{title}</Label>
        </View>
        <View style={wide ? styles.contentWide : undefined}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.strong, fontSize: type.label, letterSpacing: type.labelTracking, textTransform: 'uppercase', lineHeight: 16 },
  meta: { fontFamily: fonts.regular, fontSize: type.metadata, lineHeight: 20 },
  body: { fontFamily: fonts.regular, fontSize: type.body, lineHeight: type.body * type.bodyLeading },
  lead: { fontFamily: fonts.regular, fontSize: type.lead, lineHeight: Math.round(type.lead * type.bodyLeading) },
  itemTitle: { fontFamily: fonts.strong, fontSize: type.itemTitle, lineHeight: 28, letterSpacing: -0.5 },
  display: { fontFamily: fonts.display },
  marker: { width: 10, height: 10, backgroundColor: colors.accent },
  focusRing: { borderWidth: 3, borderColor: 'transparent', margin: -3 },
  focusRingOn: { borderColor: colors.accent },
  button: { minHeight: 56, borderWidth: rule, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, gap: 12 },
  buttonText: { fontFamily: fonts.strong, fontSize: type.body, lineHeight: 22, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: rule, borderColor: colors.ink, paddingVertical: 14, gap: 12, backgroundColor: colors.ground },
  rowPressed: { backgroundColor: colors.surface },
  rowContent: { flex: 1 },
  rowArrow: { fontFamily: fonts.strong, fontSize: 20, color: colors.ink },
  textLink: { alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
  pressedText: { color: colors.accent },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14 },
  topTitle: { flex: 1 },
  backButton: { width: 44, height: 44, borderWidth: rule, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground },
  backPressed: { backgroundColor: colors.ink },
  backText: { fontFamily: fonts.strong, fontSize: 20, color: colors.ink, lineHeight: 24 },
  sectionWide: { flexDirection: 'row' },
  rail: { marginBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  railWide: { width: '25%', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginBottom: 0, paddingRight: 16 },
  railTitle: { flexShrink: 1 },
  railMarker: { marginRight: 2 },
  contentWide: { flex: 1 },
});
