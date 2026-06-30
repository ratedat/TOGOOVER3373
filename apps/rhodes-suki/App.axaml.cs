using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using RhodesSuki.Services;
using RhodesSuki.ViewModels;
using RhodesSuki.Views;

namespace RhodesSuki;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var probe = new MaaFrameworkRuntimeProbe();
            var session = new RhodesMaaSession();
            var sessionSnapshot = RhodesMaaSession.ProbeDefaultPaths();
            var viewModel = new MainWindowViewModel(probe.Probe(), session, sessionSnapshot);
            desktop.MainWindow = new MainWindow
            {
                DataContext = viewModel,
            };
            desktop.Exit += (_, _) => viewModel.Dispose();
        }

        base.OnFrameworkInitializationCompleted();
    }
}
