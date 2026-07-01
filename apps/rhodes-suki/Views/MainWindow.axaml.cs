using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Interactivity;
using Avalonia.VisualTree;
using RhodesSuki.Models;
using RhodesSuki.ViewModels;
using SukiUI.Controls;

namespace RhodesSuki.Views;

public partial class MainWindow : SukiWindow
{
    private Control? _roiDragSource;
    private Control? _roiResizeSource;

    public MainWindow()
    {
        InitializeComponent();
        AddHandler(PointerPressedEvent, CloseOpenComboBoxesOnOutsidePress, RoutingStrategies.Tunnel, handledEventsToo: true);
    }

    private void CloseOpenComboBoxesOnOutsidePress(object? sender, PointerPressedEventArgs e)
    {
        if (e.Source is not Avalonia.Visual source)
            return;

        var clickedComboBox = source as ComboBox ?? source.GetVisualAncestors().OfType<ComboBox>().FirstOrDefault();
        foreach (var comboBox in this.GetVisualDescendants().OfType<ComboBox>())
        {
            if (ReferenceEquals(comboBox, clickedComboBox))
                continue;

            comboBox.IsDropDownOpen = false;
        }
    }

    private void RoiOverlayPointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (sender is not Control control
            || control.DataContext is not MaaRoiPreviewRow row
            || DataContext is not MainWindowViewModel viewModel)
        {
            return;
        }

        viewModel.BeginRoiDrag(row, RoiPointerX(e), RoiPointerY(e));
        _roiDragSource = control;
        e.Pointer.Capture(control);
        e.Handled = true;
    }

    private void RoiOverlayPointerMoved(object? sender, PointerEventArgs e)
    {
        if (!ReferenceEquals(sender, _roiDragSource) || DataContext is not MainWindowViewModel viewModel)
            return;

        viewModel.UpdateRoiDrag(RoiPointerX(e), RoiPointerY(e));
        e.Handled = true;
    }

    private void RoiOverlayPointerReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (!ReferenceEquals(sender, _roiDragSource) || DataContext is not MainWindowViewModel viewModel)
            return;

        viewModel.EndRoiDrag();
        e.Pointer.Capture(null);
        _roiDragSource = null;
        e.Handled = true;
    }

    private void RoiOverlayPointerCaptureLost(object? sender, PointerCaptureLostEventArgs e)
    {
        if (!ReferenceEquals(sender, _roiDragSource) || DataContext is not MainWindowViewModel viewModel)
            return;

        viewModel.EndRoiDrag();
        _roiDragSource = null;
    }

    private void RoiResizePointerPressed(object? sender, PointerPressedEventArgs e)
    {
        if (sender is not Control control
            || control.DataContext is not MaaRoiPreviewRow row
            || DataContext is not MainWindowViewModel viewModel)
        {
            return;
        }

        viewModel.BeginRoiResize(row, RoiPointerX(e), RoiPointerY(e));
        _roiResizeSource = control;
        e.Pointer.Capture(control);
        e.Handled = true;
    }

    private void RoiResizePointerMoved(object? sender, PointerEventArgs e)
    {
        if (!ReferenceEquals(sender, _roiResizeSource) || DataContext is not MainWindowViewModel viewModel)
            return;

        viewModel.UpdateRoiResize(RoiPointerX(e), RoiPointerY(e));
        e.Handled = true;
    }

    private void RoiResizePointerReleased(object? sender, PointerReleasedEventArgs e)
    {
        if (!ReferenceEquals(sender, _roiResizeSource) || DataContext is not MainWindowViewModel viewModel)
            return;

        viewModel.EndRoiResize();
        e.Pointer.Capture(null);
        _roiResizeSource = null;
        e.Handled = true;
    }

    private void RoiResizePointerCaptureLost(object? sender, PointerCaptureLostEventArgs e)
    {
        if (!ReferenceEquals(sender, _roiResizeSource) || DataContext is not MainWindowViewModel viewModel)
            return;

        viewModel.EndRoiResize();
        _roiResizeSource = null;
    }

    private double RoiPointerX(PointerEventArgs e)
    {
        return e.GetPosition(RoiCanvas).X;
    }

    private double RoiPointerY(PointerEventArgs e)
    {
        return e.GetPosition(RoiCanvas).Y;
    }
}
