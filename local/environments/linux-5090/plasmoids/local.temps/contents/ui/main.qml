import QtQuick
import QtQuick.Layouts
import org.kde.plasma.plasmoid
import org.kde.plasma.components as PC3
import org.kde.kirigami as Kirigami
import org.kde.ksysguard.sensors as Sensors

PlasmoidItem {
    preferredRepresentation: fullRepresentation

    fullRepresentation: Item {
        implicitWidth: row.implicitWidth
        implicitHeight: row.implicitHeight
        Layout.minimumWidth: row.implicitWidth
        Layout.preferredWidth: row.implicitWidth

        RowLayout {
            id: row
            anchors.centerIn: parent
            spacing: Kirigami.Units.largeSpacing

            Repeater {
                model: [
                    { icon: "cpu-symbolic", sensor: "lmsensors/nct6687-isa-0a20/temp1" },
                    { icon: "gpu-symbolic", sensor: "gpu/gpu1/temperature" },
                    { icon: "raindrop", sensor: "lmsensors/kraken2023elite-hid-3-d/temp1" }
                ]
                delegate: RowLayout {
                    required property var modelData
                    spacing: Kirigami.Units.smallSpacing
                    Sensors.Sensor { id: sensor; sensorId: modelData.sensor; updateRateLimit: 2000 }
                    Kirigami.Icon {
                        source: modelData.icon
                        isMask: true
                        color: Kirigami.Theme.textColor
                        Layout.preferredWidth: Kirigami.Units.iconSizes.small
                        Layout.preferredHeight: Kirigami.Units.iconSizes.small
                    }
                    PC3.Label { text: sensor.value === undefined ? "–" : Math.round(sensor.value) + "°" }
                }
            }
        }
    }
}
